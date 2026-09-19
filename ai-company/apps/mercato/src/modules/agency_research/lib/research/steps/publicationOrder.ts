import { AgencyResearchDocumentVersion } from '../../../data/entities'
import { adapterFor } from '../../../data/adapters'
import type { DocumentIssue, InputVersion } from '../../../data/schemas/envelope'
import { approvalRecordSchema } from '../../../data/schemas/envelope'
import { eskalacjaDataSchema } from '../../../data/schemas/eskalacja'
import { konfigPublikacjiDataSchema } from '../../../data/schemas/konfigPublikacji'
import { postDataSchema } from '../../../data/schemas/post'
import { potwierdzeniePublikacjiDataSchema } from '../../../data/schemas/potwierdzeniePublikacji'
import { zleceniePostuDataSchema } from '../../../data/schemas/zleceniePostu'
import { z } from 'zod'
import { currentInputVersion, finishTaskRun, saveDocumentVersion, startTaskRun } from '../../store'
import { buildPublicationOrder, type PostVersionFacts } from '../publication'
import { renderZleceniePublikacji, renderZleceniePublikacjiClientView } from '../render/zleceniePublikacji'
import { simulationIssue } from '../simulation'
import type { StepContext, StepOutcome } from './context'

/**
 * Step 8.3 — WEW-ZLECENIE-PUBLIKACJI: one pinned KLI-POST version by hash, the
 * payload snapshot, the destination from the configuration, the two decision
 * checks (content approval ≠ publication consent), the execution guard, the
 * hold and the Q-PUB preflight evaluated from the CURRENT state. Compiling the
 * order grants nothing: "przygotowane" is not "gotowe do wysłania".
 */

export async function runPublicationOrderStep(ctx: StepContext): Promise<StepOutcome> {
  const { em, scope, orderRef } = ctx
  const post = await currentInputVersion(em, scope, orderRef, 'WZR-POST')
  const config = await currentInputVersion(em, scope, orderRef, 'WZR-KONFIG-PUBLIKACJI')
  if (!post || !config) throw new Error('[internal] 8.3 needs current KLI-POST and WEW-KONFIG-PUBLIKACJI versions — run the process through 7.3 and 8.2 first')
  const instruction = await currentInputVersion(em, scope, orderRef, 'WZR-ZLECENIE-POSTU')
  const previous = await currentInputVersion(em, scope, orderRef, 'WZR-ZLECENIE-PUBLIKACJI')
  const confirmation = await currentInputVersion(em, scope, orderRef, 'WZR-POTWIERDZENIE-PUBLIKACJI')
  const escalation = await currentInputVersion(em, scope, orderRef, 'WZR-ESKALACJA')
  const pin = (v: InputVersion & { versionId: string }): InputVersion => ({ document_id: v.document_id, version: v.version, status: v.status })
  const inputVersions: InputVersion[] = [ctx.orderVersion, pin(post), pin(config), ...(instruction ? [pin(instruction)] : []), ...(previous ? [pin(previous)] : [])]
  const run = await startTaskRun(em, scope, { orderRef, brand: ctx.order.brand, stepId: '8.3', attempt: ctx.attempt, runner: ctx.runner, models: {}, inputVersions })
  ctx.taskRunIds.push(run.id)
  try {
    const lang = ctx.order.outputLanguage
    const postData = postDataSchema.parse(post.data)
    const configData = konfigPublikacjiDataSchema.parse(config.data)
    // The approval records live on the exact version row, never on the document.
    const versionRow = await em.findOne(AgencyResearchDocumentVersion, { id: post.versionId })
    const postVersion: PostVersionFacts = {
      documentId: post.document_id,
      version: post.version,
      status: post.status,
      approvalRecords: z.array(approvalRecordSchema).catch([]).parse(versionRow?.approvalRecords ?? []),
      isCurrent: true,
    }
    const escalationData = escalation ? eskalacjaDataSchema.pick({ resolution: true }).safeParse(escalation.data) : null
    const openEscalationRef = escalation && escalationData?.success && escalationData.data.resolution.state === 'open' ? `${escalation.document_id}@${escalation.version}` : null
    const priorConfirmation = confirmation ? potwierdzeniePublikacjiDataSchema.safeParse(confirmation.data) : null
    const priorOutcome = priorConfirmation?.success && priorConfirmation.data.approved_material_ref.content_version === post.version ? priorConfirmation.data.outcome : null
    const cta = instruction ? zleceniePostuDataSchema.safeParse(instruction.data) : null
    const { data, contentHash } = buildPublicationOrder(
      {
        orderRef,
        post: postData,
        postVersion,
        config: configData,
        configVersion: pin(config),
        adapter: adapterFor(configData.platform.platform),
        openEscalationRef,
        priorOutcome,
        ctaPublicationReadiness: cta?.success ? cta.data.delivery_constraints.cta_publication_readiness : null,
      },
      lang,
    )
    const issues: DocumentIssue[] = []
    const simulated = simulationIssue(inputVersions)
    if (simulated) issues.push({ ...simulated, path: 'content_approval_check' })
    for (const row of data.preflight.check_results) {
      if (row.result === 'pass') continue
      issues.push({ code: `PREFLIGHT_${row.gate.toUpperCase()}`, severity: 'blocking_publication', detail: row.detail ?? row.result, path: `preflight.check_results.${row.gate}` })
    }
    const view = renderZleceniePublikacjiClientView({ outputLanguage: lang, brand: ctx.order.brand, data })
    if (view.issue) issues.push(view.issue)
    const saved = await saveDocumentVersion(em, scope, {
      orderRef,
      brand: ctx.order.brand,
      templateId: 'WZR-ZLECENIE-PUBLIKACJI',
      status: data.preflight.state === 'ready' ? 'ready_for_review' : 'blocked',
      inputVersions,
      data: data as unknown as Record<string, unknown>,
      issues,
      renderedMd: renderZleceniePublikacji({ outputLanguage: lang, brand: ctx.order.brand, data, issues }),
      clientViewMd: view.markdown,
      taskRunId: run.id,
      simulation: simulated !== null,
    })
    ctx.documentVersionIds.push(saved.version.id)
    const failed = data.preflight.check_results.filter((r) => r.result !== 'pass').map((r) => r.gate)
    await finishTaskRun(em, run, {
      status: 'done',
      outputVersionId: saved.version.id,
      summary: { preflight: data.preflight.state, failed_gates: failed, content_hash: contentHash, idempotency_key: data.execution_guard.idempotency_key, hold: data.current_hold.state },
      cost: ctx.ledger.snapshot(),
    })
    ctx.log(`8.3 publication order ${data.preflight.state}${failed.length ? ` (failed: ${failed.join(', ')})` : ''}`)
    return { taskRunId: run.id, versionId: saved.version.id, status: 'done' }
  } catch (error) {
    await finishTaskRun(em, run, { status: 'failed', cost: ctx.ledger.snapshot(), error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
