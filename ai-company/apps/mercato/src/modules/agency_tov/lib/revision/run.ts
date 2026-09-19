import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { getTelemetryRuntime } from '@open-mercato/shared/lib/telemetry/runtime'
import { AgencyTovDocument, AgencyTovResearchRun } from '../../data/entities'
import { tovBrandSynthesizerInputSchema, tovBrandSynthesizerResult } from '../../data/validators'
import { TOV_BRAND_SYNTHESIZER_AGENT_ID } from '../agentIds'
import { groundBrandVoice } from '../tov/grounding'
import { linkResolverFor, renderBrandTov } from '../tov/render'
import type { TovAgentRunner } from '../tov/pipeline'
import { citationsOf, finishResearchRun, saveDocumentVersion, startResearchRun, type TovScope } from '../store'
import { tovRevisionCompletedSchema, tovRevisionRequestSchema, type TovRevisionInput, type TovRevisionResult } from './contracts'
import { readRevisionEvidence } from './read'

export async function runTovRevision(input: {
  em: EntityManager; scope: TovScope; request: TovRevisionInput['request'];
  executionPolicy: NonNullable<TovRevisionInput['executionPolicy']>; runAgent: TovAgentRunner; agentRunIds: string[];
}): Promise<TovRevisionResult> {
  const { em, scope, executionPolicy, runAgent, agentRunIds } = input
  const request = tovRevisionRequestSchema.parse(input.request)
  const runner = `orchestrator:revision:${request.requestId}`
  const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex')
  type Claim = { result: TovRevisionResult } | {
    researchRunId: string; evidence: NonNullable<Awaited<ReturnType<typeof readRevisionEvidence>>>;
    revision: { requestHash: string; request: typeof request; executionPolicy: typeof executionPolicy; profileVersionIds: string[] };
  }
  const claim = await em.transactional<Claim>(async (transaction) => {
    const document = await findOneWithDecryption(transaction, AgencyTovDocument, {
      ...scope, id: request.previous.documentId, kind: 'KLI-TOV', deletedAt: null,
    }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
    if (!document) return { result: { status: 'not_ready', reason: 'previous_version_unavailable' } as TovRevisionResult }
    const saved = await findOneWithDecryption(transaction, AgencyTovResearchRun, { ...scope, runner }, undefined, scope)
    if (saved) {
      const metadata = z.object({ revision: z.object({ requestHash: z.string(), outcome: z.unknown().optional() }) }).parse(saved.stats)
      if (metadata.revision.requestHash !== requestHash) throw new Error('[internal] ToV revision replay differs from its saved source')
      const outcome = tovRevisionCompletedSchema.safeParse(metadata.revision.outcome)
      if (saved.status === 'done' && outcome.success) return { result: { ...outcome.data, replayed: true } as TovRevisionResult }
      return { result: { status: 'execution_incomplete', researchRunId: saved.id,
        reason: saved.status === 'running' ? 'in_progress_or_interrupted' : saved.status === 'failed' ? 'failed' : 'result_unavailable' } as TovRevisionResult }
    }
    if (document.currentVersionId !== request.previous.versionId) return { result: { status: 'not_ready', reason: 'previous_version_not_current' } as TovRevisionResult }
    const running = await findOneWithDecryption(transaction, AgencyTovResearchRun, {
      ...scope, brand: document.brand, runner: { $like: 'orchestrator:revision:%' }, status: 'running',
    }, undefined, scope)
    if (running) return { result: { status: 'not_ready', reason: 'revision_in_progress' } as TovRevisionResult }
    const evidence = await readRevisionEvidence(transaction, scope, request)
    if (!evidence) return { result: { status: 'not_ready', reason: 'evidence_unavailable' } as TovRevisionResult }
    const run = await startResearchRun(transaction, scope, { brand: document.brand, outputLanguage: evidence.outputLanguage,
      runner, models: null, corpus: evidence.corpus })
    const revision = { requestHash, request, executionPolicy, profileVersionIds: evidence.profileVersionIds }
    run.stats = { revision }
    await transaction.flush()
    return { researchRunId: run.id, evidence, revision }
  })
  if ('result' in claim) return claim.result
  const { evidence, revision, researchRunId } = claim
  const run = await findOneWithDecryption(em, AgencyTovResearchRun, { ...scope, id: researchRunId }, undefined, scope)
  if (!run) throw new Error('[internal] Claimed ToV revision disappeared')
  let groundingReport: unknown = []
  try {
    const modelInput = tovBrandSynthesizerInputSchema.parse({
      brand: evidence.previous.brand, outputLanguage: evidence.outputLanguage, profiles: evidence.profiles,
      correction: { previousVersion: request.previous.version, previous: evidence.previous.body,
        instructions: request.instructions, affectedFields: request.affectedFields },
    })
    const output = tovBrandSynthesizerResult.parse(await runAgent(TOV_BRAND_SYNTHESIZER_AGENT_ID, modelInput, { runTimeoutMs: executionPolicy.runTimeoutMs }))
    const body = { ...evidence.previous.body }
    for (const field of request.affectedFields) Object.assign(body, { [field]: output.data[field] })
    const grounded = groundBrandVoice(body, evidence.corpus.posts)
    groundingReport = [{ type: 'grounding', step: 'brand_revision', kept: grounded.kept, dropped: grounded.dropped,
      issues: grounded.issues, repairs: grounded.repairs }]
    const changedFields = request.affectedFields.filter((field) => !isDeepStrictEqual(evidence.previous.body[field], grounded.value[field]))
    return await em.transactional(async (transaction) => {
      const document = await findOneWithDecryption(transaction, AgencyTovDocument, {
        ...scope, id: request.previous.documentId, deletedAt: null,
      }, { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true }, scope)
      if (!document || document.currentVersionId !== request.previous.versionId) throw new Error('[internal] ToV version changed during revision; no replacement was saved')
      const { version } = await saveDocumentVersion(transaction, scope, {
        brand: evidence.previous.brand, kind: 'KLI-TOV', profileUrl: '', title: document.title, researchRunId,
        body: grounded.value, renderedMd: renderBrandTov(grounded.value, evidence.profiles, linkResolverFor(evidence.corpus.posts)),
        citations: citationsOf(grounded.value, evidence.corpus.posts, evidence.corpus.rowOf),
      })
      const result = tovRevisionCompletedSchema.parse({ status: 'completed', requestId: request.requestId,
        previousVersionId: request.previous.versionId, reference: { owner: 'agency_tov', kind: 'KLI-TOV', researchRunId,
          documentId: document.id, versionId: version.id, version: `${version.versionNo}.0` }, agentRunIds, changedFields, replayed: false })
      const completedRun = await findOneWithDecryption(transaction, AgencyTovResearchRun, { ...scope, id: researchRunId }, undefined, scope)
      if (!completedRun) throw new Error('[internal] Claimed ToV revision disappeared')
      const stats = { posts: evidence.corpus.posts.length, profiles: evidence.profiles.length, batches: 0, agentCalls: 1,
        cachedSteps: 0, ungroundedDropped: grounded.dropped, groundingRejections: 0, revision: { ...revision, outcome: result } }
      await finishResearchRun(transaction, completedRun, { status: 'done', stats, groundingReport })
      return result
    })
  } catch (error) {
    getTelemetryRuntime()?.reportError(error, { module: 'agency_tov', code: 'agency_tov.revision_failed' })
    run.stats = { revision: { ...revision, agentRunIds } }
    await finishResearchRun(em, run, { status: 'failed', error: error instanceof Error ? error.message : String(error), groundingReport })
    throw error
  }
}
