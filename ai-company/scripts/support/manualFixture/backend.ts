import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { bootstrapFromAppRoot } from '@open-mercato/shared/lib/bootstrap/dynamicLoader'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AiAgentRuntimeOverride } from '@open-mercato/ai-assistant/modules/ai_assistant/data/entities'
import { AiAgentRuntimeOverrideRepository } from '@open-mercato/ai-assistant/modules/ai_assistant/data/repositories/AiAgentRuntimeOverrideRepository'
import { UserTask, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { AgencyCase, AgencyClientSubmission } from '@/modules/agency_operations/data/entities'
import { inputSchema, clientTriageInterpretationSchema, type ClientTriageInput } from '@/modules/agency_operations/agents/client-triage/contract'
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService } from '@/modules/agency_research/lib/contracts/agencyResearch'
import { briefAnswerAgentResultSchema } from '@/modules/agency_research/lib/briefRevision/contracts'
import { postAuthorInputSchema, postEditorInputSchema } from '@/modules/agency_research/data/agents/post'
import { startNativeTriageProvider } from '@/modules/agency_operations/__integration__/support/nativeTriageProvider'
import { createProductionJourneyIntelligence } from '@/modules/agency_operations/__integration__/support/productionJourney/intelligence'
import { createSelectedPostIntelligence } from '@/modules/agency_operations/__integration__/support/postIntelligence'
import { explicitAnswers } from './answers'

const scopeSchema = z.object({ tenantId: z.uuid(), organizationId: z.uuid() })
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {}
const briefAnswerInput = z.object({ originalText: z.string(), questions: z.array(z.object({ question_id: z.string(), brief_field: z.string(), question: z.string() })) })

export async function startManualFixture(appRoot: string) {
  if (process.env.NODE_ENV === 'production' || process.env.AGENCY_MANUAL_PROFILE !== 'fixture'
    || process.env.AGENCY_TEST_NATIVE_TRIAGE !== '1') throw new Error('Explicit manual fixture mode required')
  const scope = scopeSchema.parse({ tenantId: process.env.AGENCY_MANUAL_TENANT_ID, organizationId: process.env.AGENCY_MANUAL_ORGANIZATION_ID })
  await bootstrapFromAppRoot(appRoot)
  const container = await createRequestContainer()
  // Native DB overrides outrank the pinned fixture environment. Inspect all active
  // agent/default entries for this manual scope before the launcher starts its worker.
  const overrideEm = container.resolve<EntityManager>('em').fork()
  const overrideKeys = await overrideEm.find(AiAgentRuntimeOverride, {
    tenantId: scope.tenantId, organizationId: { $in: [scope.organizationId, null] }, deletedAt: null,
  })
  const overrides = new AiAgentRuntimeOverrideRepository(overrideEm)
  for (const key of overrideKeys) {
    const row = await overrides.getExact({ tenantId: scope.tenantId, organizationId: key.organizationId, agentId: key.agentId })
    if (!row) continue
    const provider = row.providerId?.trim()
    const model = row.modelId?.trim()
    const baseUrl = row.baseUrl?.trim().replace(/\/$/, '')
    if ((provider && provider !== 'openrouter')
      || (model && !['agency-triage-fixture', 'openrouter/agency-triage-fixture'].includes(model))
      || (baseUrl && baseUrl !== 'http://127.0.0.1:5005/v1') || row.inputModeration === true) {
      throw new Error('Manual fixture refuses an active native model/provider/endpoint or moderation override outside its unpaid local configuration')
    }
  }
  const research = container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE)
  const intelligence = createProductionJourneyIntelligence(appRoot)
  const manager = () => container.resolve<EntityManager>('em').fork()

  async function savedOriginal(input: ClientTriageInput) {
    const em = manager()
    const candidates = await findWithDecryption(em, AgencyClientSubmission, {
      ...scope, eventId: input.original.eventId, deletedAt: null,
    }, { limit: 20 }, scope)
    const matches = candidates.filter((row) => {
      const saved = inputSchema.safeParse({ original: row.original })
      return saved.success && isDeepStrictEqual(saved.data.original, input.original)
    })
    if (matches.length !== 1) throw new Error('Fixture interpretation requires one exact scoped persisted submission')
    const submission = matches[0]
    const workflow = submission.workflowInstanceId ? await findOneWithDecryption(em, WorkflowInstance, {
      ...scope, id: submission.workflowInstanceId, workflowId: 'agency_operations.client-submission.native.v1', deletedAt: null,
    }, undefined, scope) : null
    if (!workflow || workflow.context.submissionId !== submission.id || workflow.context.caseId !== submission.caseId) {
      throw new Error('Fixture original is not bound to its real native submission workflow')
    }
    const agencyCase = await findOneWithDecryption(em, AgencyCase, {
      ...scope, id: submission.caseId, customerEntityId: submission.customerEntityId, deletedAt: null,
    }, undefined, scope)
    if (!agencyCase) throw new Error('Fixture submission case is unavailable')
    return { em, submission }
  }

  async function completedResponse(em: EntityManager, submission: AgencyClientSubmission, response: { taskId: string }, key: string) {
    const task = await findOneWithDecryption(em, UserTask, { ...scope, id: response.taskId, status: 'COMPLETED',
      assigneeKind: 'customer', assignedTo: submission.submittedByCustomerUserId, completedBy: submission.submittedByCustomerUserId,
    }, undefined, scope)
    const { taskId: _task, ...original } = response
    if (!task || !isDeepStrictEqual(record(task.formData)[key], original)) throw new Error('Fixture response does not match its completed customer task')
  }

  const server = await startNativeTriageProvider(5005, { resolveStructured: async (request) => {
    const parsed = request.userTexts.flatMap((text) => { try { return [JSON.parse(text)] } catch { return [] } })
    if (parsed.length !== 1) throw new Error('One typed fixture input required')
    const raw = parsed[0]
    if (request.formatName === 'agency_operations_client_triage') {
      const input = inputSchema.parse(raw)
      const { em, submission } = await savedOriginal(input)
      const original = input.original
      const response = original.reviewResponse ?? original.strategyReviewResponse ?? original.planReviewResponse ?? original.postReviewResponse
      const key = original.reviewResponse ? 'briefReviewResponse' : original.strategyReviewResponse ? 'strategyPairResponse'
        : original.planReviewResponse ? 'planResponse' : 'postResponse'
      if (response) await completedResponse(em, submission, response, key)
      // Structured user actions are interpreted; their downstream native permission/acceptance checks are never bypassed.
      const approve = response?.kind === 'approval'
      const briefChange = original.reviewResponse?.kind === 'message'
      const disposition = approve ? 'approve' : briefChange ? 'change' : original.materialAttachmentId ? 'answer' : 'clarify'
      return clientTriageInterpretationSchema.parse({
        parts: [{ intent: approve ? 'approval' : briefChange ? 'change' : original.materialAttachmentId ? 'material' : 'question',
          summary: 'Actual saved manual-demo customer action.', rationale: 'Local intelligence reads the exact saved original; it grants no authority.',
          needsClarification: disposition === 'clarify', recommendedDisposition: disposition }],
        rationale: 'Deterministic manual fixture, not live semantic interpretation.', recommendedDisposition: disposition,
        responseMessage: disposition === 'clarify'
          ? 'This local demo cannot infer that request. Use an explicit document review action or answer the full invited brief question.'
          : 'Your saved response is being handled by the native process. No approval or publication is inferred from silence.',
      })
    }
    if (request.formatName === 'agency_research_brief_answers') {
      const input = briefAnswerInput.parse(raw)
      const em = manager()
      const submissions = await findWithDecryption(em, AgencyClientSubmission, {
        ...scope, original: { text: input.originalText }, deletedAt: null,
      }, { limit: 20, orderBy: { createdAt: 'desc' } }, scope)
      let bound = false
      for (const submission of submissions) {
        const original = inputSchema.safeParse({ original: submission.original })
        const response = original.success ? original.data.original.reviewResponse : undefined
        if (!response || response.kind !== 'message' || response.body !== input.originalText) continue
        await completedResponse(em, submission, response, 'briefReviewResponse')
        const review = await research.getBriefReview(scope, submission.caseId, response.versionId)
        if (review && input.questions.every((question) => review.questions.some((saved) =>
          saved.question_id === question.question_id && saved.brief_field === question.brief_field && saved.question === question.question))) {
          bound = true; break
        }
      }
      if (!bound) throw new Error('Manual answer input lacks its exact saved customer response and invited questions')
      return briefAnswerAgentResultSchema.parse({ kind: 'research', data: { answers: explicitAnswers(input.originalText, input.questions) } })
    }
    if (request.formatName === 'agency_research_post_author' || request.formatName === 'agency_research_post_editor') {
      const author = request.formatName === 'agency_research_post_author'
      const input = (author ? postAuthorInputSchema : postEditorInputSchema).parse(raw)
      const selected = input.selected_item
      const orderRef = selected.plan_id.startsWith('KLI-PLAN@') ? selected.plan_id.slice('KLI-PLAN@'.length) : ''
      if (!orderRef || selected.selection_status !== 'client_selected' || !selected.decision_id) throw new Error('Manual post requires a real plan selection')
      const status = await research.status(scope, orderRef)
      const plan = status.documents.find((document) => document.templateId === 'WZR-PLAN')
      if (!plan?.versionId) throw new Error('Manual plan is unavailable')
      const acceptance = await research.getPlanAcceptance(scope, { orderRef, planVersionId: plan.versionId })
      if (acceptance.status !== 'ready' || !acceptance.receipt || acceptance.plan.version !== selected.plan_version
        || acceptance.plan.documentStatus !== 'approved' || acceptance.plan.versionStatus !== 'approved'
        || acceptance.receipt.selectedTopicId !== selected.topic_id || acceptance.receipt.source.submissionId !== selected.decision_id) {
        throw new Error('Manual post input is outside the actual saved topic selection')
      }
      if (selected.topic_id !== 'TOP02') throw new Error('Current manual post intelligence supports only an actually selected TOP02; other topic support is pending the shared fixture helper extension')
      const post = createSelectedPostIntelligence({ duplicateOpening: false })
      return (await post(author ? 'agency_research.post_author' : 'agency_research.post_editor', input, { runTimeoutMs: 1000, tier: 'fixture' })).result
    }
    if (request.formatName === 'agency_research_page_extractor' && raw?.page?.url?.startsWith('attachment://')) {
      // No canned business facts are attributed to an arbitrary human upload.
      return { kind: 'research', data: { facts: [], language_samples: [], audience_signals: [],
        page_summary: 'Manual fixture does not interpret arbitrary private attachments. Native storage/extraction remains real; no business claim or client decision is inferred.' } }
    }
    const result = await intelligence.resolveStructured(request)
    if (result === undefined) throw new Error('No manual fixture intelligence exists for this agent/input')
    return result
  } })
  return { close: server.close }
}
