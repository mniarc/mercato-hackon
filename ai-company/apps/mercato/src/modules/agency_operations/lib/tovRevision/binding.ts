import { isDeepStrictEqual } from 'node:util'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { StepInstance, UserTask, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { AgentRun } from '@open-mercato/enterprise/modules/agent_orchestrator/data/entities'
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService } from '@/modules/agency_research/lib/contracts'
import { tovRevisionFieldSchema } from '@/modules/agency_tov/data/validators'
import type { TovRevisionRequest } from '@/modules/agency_tov/lib/revision/contracts'
import { AgencyCase, type AgencyClientSubmission } from '../../data/entities'
import { CLIENT_TRIAGE_AGENT_ID, clientTriageInterpretationSchema, inputSchema } from '../../agents/client-triage/contract'
import { strategyPairEventId } from '../strategyPairReview/service'
import { STRATEGY_PAIR_RESPONSE_CONTEXT_KEY, STRATEGY_PAIR_REVIEW_CONTEXT_KEY, STRATEGY_PAIR_REVIEW_WORKFLOW_ID, strategyPairInvitationSchema, strategyPairRequestSchema } from '../strategyPairReview/contracts'

function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {} }
type ContactService = { findById(id: string, tenantId: string, organizationId: string): Promise<{ isActive?: boolean; customerEntityId?: string | null } | null> }

export function createTovRevisionBinding(container: AppContainer) {
  return { async load(submission: AgencyClientSubmission, interpretation: unknown): Promise<TovRevisionRequest | null> {
    const parsed = clientTriageInterpretationSchema.safeParse(interpretation)
    if (!parsed.success || parsed.data.recommendedDisposition !== 'change' || !parsed.data.tovDirective
      || parsed.data.parts.some((part) => part.recommendedDisposition !== 'change' || part.needsClarification || part.intent !== 'change')) return null
    const preserved = inputSchema.safeParse({ original: submission.original })
    if (!preserved.success || !submission.workflowInstanceId) return null
    const response = preserved.data.original.strategyReviewResponse
    if (!response || response.kind !== 'message') return null
    const original = strategyPairRequestSchema.safeParse(Object.fromEntries(Object.entries(response).filter(([key]) => key !== 'taskId')))
    if (!original.success || !original.data.body || preserved.data.original.text !== original.data.body
      || preserved.data.original.documentVersionReference !== response.strategy.versionId
      || submission.eventId !== strategyPairEventId(response.taskId, response.externalEventId)
      || preserved.data.original.eventId !== submission.eventId) return null
    const scope = { tenantId: submission.tenantId, organizationId: submission.organizationId }
    const em = container.resolve<EntityManager>('em')
    const agencyCase = await findOneWithDecryption(em, AgencyCase, { ...scope, id: submission.caseId,
      customerEntityId: submission.customerEntityId, deletedAt: null }, undefined, scope)
    if (!agencyCase) return null
    const task = await findOneWithDecryption(em, UserTask, { ...scope, id: response.taskId, status: 'COMPLETED', assigneeKind: 'customer',
      assignedTo: submission.submittedByCustomerUserId, completedBy: submission.submittedByCustomerUserId }, undefined, scope)
    if (!task || !isDeepStrictEqual(record(task.formData)[STRATEGY_PAIR_RESPONSE_CONTEXT_KEY], original.data)) return null
    const workflow = await findOneWithDecryption(em, WorkflowInstance, { ...scope, id: task.workflowInstanceId,
      workflowId: STRATEGY_PAIR_REVIEW_WORKFLOW_ID, deletedAt: null }, undefined, scope)
    const invitation = strategyPairInvitationSchema.safeParse(workflow?.context[STRATEGY_PAIR_REVIEW_CONTEXT_KEY])
    if (!invitation.success || invitation.data.caseId !== submission.caseId || invitation.data.review.caseId !== submission.caseId
      || invitation.data.customerEntityId !== submission.customerEntityId || invitation.data.customerUserId !== submission.submittedByCustomerUserId
      || invitation.data.review.strategy.documentId !== response.strategy.documentId || invitation.data.review.strategy.versionId !== response.strategy.versionId
      || invitation.data.review.tov.documentId !== response.tov.documentId || invitation.data.review.tov.versionId !== response.tov.versionId) return null
    const contact = await container.resolve<ContactService>('customerUserService').findById(submission.submittedByCustomerUserId, scope.tenantId, scope.organizationId)
    if (!contact?.isActive || contact.customerEntityId !== submission.customerEntityId) return null
    const step = await findOneWithDecryption(em, StepInstance, { ...scope, workflowInstanceId: submission.workflowInstanceId, stepId: 'triage', status: 'COMPLETED' }, { orderBy: { exitedAt: 'DESC' } }, scope)
    if (!step) return null
    const run = await findOneWithDecryption(em, AgentRun, { ...scope, workflowInstanceId: submission.workflowInstanceId, stepId: 'triage', invocationId: step.id,
      agentId: CLIENT_TRIAGE_AGENT_ID, runtime: 'native', status: 'ok', deletedAt: null }, undefined, scope)
    const output = record(run?.output)
    const saved = clientTriageInterpretationSchema.safeParse(output.data)
    const savedInput = inputSchema.safeParse(run?.input)
    if (!run || output.kind !== 'research' || !saved.success || !isDeepStrictEqual(saved.data, parsed.data)
      || !savedInput.success || !isDeepStrictEqual(savedInput.data, preserved.data)) return null
    const review = await container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE).getStrategyReview(scope, submission.caseId, response.strategy.versionId, response.tov.versionId)
    if (!review?.brief || !review.tov.specialistReference || !review.tovUsesStrategy
      || review.strategy.documentId !== response.strategy.documentId || review.tov.documentId !== response.tov.documentId) return null
    return { requestId: submission.id, previous: review.tov.specialistReference, briefVersionId: review.brief.versionId,
      strategyVersionId: review.strategy.versionId, source: { kind: 'client_change', submissionId: submission.id, invitationTaskId: task.id, agentRunId: run.id },
      instructions: original.data.body,
      affectedFields: [...new Set(parsed.data.tovDirective.affectedFields)] }
  } }
}

/** Only exact specialist field paths from saved 5.4 findings authorize a narrow repair. */
export function tovFieldsFromFindings(findings: { severity: string; owner: string; fix_step?: string | null; path: string; gap: string; fix_hint?: string | null }[]) {
  const blocking = findings.filter((finding) => finding.severity === 'blocking')
  if (!blocking.length || blocking.some((finding) => finding.fix_step !== '5.3' || finding.owner !== 'agent')) return null
  const fields = blocking.map((finding) => tovRevisionFieldSchema.safeParse(finding.path.replace(/^KLI-TOV\./, '').split(/[.\[]/, 1)[0]))
  if (fields.some((field) => !field.success)) return null
  return { affectedFields: [...new Set(fields.flatMap((field) => field.success ? [field.data] : []))],
    instructions: blocking.map((finding) => `${finding.path}: ${finding.gap}${finding.fix_hint ? `\n${finding.fix_hint}` : ''}`).join('\n\n') }
}
