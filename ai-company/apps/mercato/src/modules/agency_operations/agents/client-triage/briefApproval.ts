import { isDeepStrictEqual } from 'node:util'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { UserTask, WorkflowInstance, StepInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { AgentRun } from '@open-mercato/enterprise/modules/agent_orchestrator/data/entities'
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService } from '@/modules/agency_research/lib/contracts'
import type { AgencyClientSubmission } from '../../data/entities'
import { briefResponseEventId } from '../../lib/briefStrategyProcess/service'
import { BRIEF_REVIEW_CONTEXT_KEY, BRIEF_REVIEW_WORKFLOW_ID, BRIEF_RESPONSE_CONTEXT_KEY, briefReviewInvitationSchema, briefReviewRequestSchema } from '../../lib/briefStrategyProcess/contracts'
import { CLIENT_TRIAGE_AGENT_ID, clientTriageInterpretationSchema, inputSchema } from './contract'
import { NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID } from './workflow'
import { projectClientTriageResult } from './projectResult'

type Contacts = { findById(id: string, tenantId: string, organizationId: string): Promise<{ isActive?: boolean; customerEntityId?: string | null } | null> }
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }

export function createBriefApproval(container: AppContainer) {
  async function load(submission: AgencyClientSubmission, interpretation: unknown) {
    const preserved = inputSchema.safeParse({ original: submission.original })
    if (!preserved.success) return null
    const response = preserved.data.original.reviewResponse
    if (!response || !submission.workflowInstanceId) return null
    const candidate = projectClientTriageResult({ tenantId: submission.tenantId, organizationId: submission.organizationId,
      customerEntityId: submission.customerEntityId, caseId: submission.caseId, submissionId: submission.id,
      workflowInstanceId: submission.workflowInstanceId }, interpretation, ['brief_accepted'])
    if (candidate.disposition?.kind !== 'approve') return null
    const original = briefReviewRequestSchema.safeParse(Object.fromEntries(Object.entries(response).filter(([key]) => key !== 'taskId')))
    if (!original.success || preserved.data.original.documentVersionReference !== response.versionId
      || submission.eventId !== briefResponseEventId(response.taskId, response.externalEventId)) return null
    const scope = { tenantId: submission.tenantId, organizationId: submission.organizationId }
    const em = container.resolve<EntityManager>('em')
    const task = await findOneWithDecryption(em, UserTask, {
      id: response.taskId, ...scope, status: 'COMPLETED', assigneeKind: 'customer',
      assignedTo: submission.submittedByCustomerUserId, completedBy: submission.submittedByCustomerUserId,
    }, undefined, scope)
    if (!task || !isDeepStrictEqual(record(task.formData)[BRIEF_RESPONSE_CONTEXT_KEY], original.data)) return null
    const invitationWorkflow = await findOneWithDecryption(em, WorkflowInstance, {
      id: task.workflowInstanceId, workflowId: BRIEF_REVIEW_WORKFLOW_ID, ...scope, deletedAt: null,
    }, undefined, scope)
    const invitation = briefReviewInvitationSchema.safeParse(invitationWorkflow?.context[BRIEF_REVIEW_CONTEXT_KEY])
    if (!invitation.success || invitation.data.caseId !== submission.caseId || invitation.data.review.caseId !== submission.caseId
      || invitation.data.customerEntityId !== submission.customerEntityId || invitation.data.customerUserId !== submission.submittedByCustomerUserId
      || invitation.data.review.documentId !== response.documentId || invitation.data.review.versionId !== response.versionId) return null
    const contact = await container.resolve<Contacts>('customerUserService').findById(submission.submittedByCustomerUserId, scope.tenantId, scope.organizationId)
    if (!contact?.isActive || contact.customerEntityId !== submission.customerEntityId) return null
    const step = await findOneWithDecryption(em, StepInstance, {
      workflowInstanceId: submission.workflowInstanceId, stepId: 'triage', status: 'COMPLETED', ...scope,
    }, { orderBy: { exitedAt: 'DESC' } }, scope)
    if (!step) return null
    const run = await findOneWithDecryption(em, AgentRun, {
      workflowInstanceId: submission.workflowInstanceId, stepId: 'triage', invocationId: step.id,
      agentId: CLIENT_TRIAGE_AGENT_ID, status: 'ok', runtime: 'native', ...scope, deletedAt: null,
    }, undefined, scope)
    const result = record(run?.output)
    const saved = clientTriageInterpretationSchema.safeParse(result.data)
    const runInput = inputSchema.safeParse(run?.input)
    if (!run || result.kind !== 'research' || !saved.success || !isDeepStrictEqual(saved.data, interpretation)
      || !runInput.success || !isDeepStrictEqual(runInput.data, preserved.data)) return null
    return {
      orderRef: submission.caseId, documentId: response.documentId, versionId: response.versionId,
      customerUserId: submission.submittedByCustomerUserId,
      source: { submissionId: submission.id, eventId: submission.eventId, workflowInstanceId: submission.workflowInstanceId, agentRunId: run.id, invitationTaskId: task.id },
    }
  }

  return {
    load,
    async accept(submission: AgencyClientSubmission, interpretation: unknown) {
      const request = await load(submission, interpretation)
      if (!request) throw new Error('[internal] Brief acceptance requires the exact authorized review original and saved native interpretation')
      const scope = { tenantId: submission.tenantId, organizationId: submission.organizationId }
      const em = container.resolve<EntityManager>('em')
      const workflow = await findOneWithDecryption(em, WorkflowInstance, {
        id: submission.workflowInstanceId, workflowId: NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID, ...scope, deletedAt: null,
      }, undefined, scope)
      if (!workflow) throw new Error('[internal] Brief acceptance workflow is outside scope')
      const userId = await resolveWorkflowPrincipalUserId(em, workflow)
      if (!userId) throw new Error('[internal] Brief acceptance requires the native workflow execution principal')
      return container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE).acceptBrief({ context: { ...scope, userId }, request })
    },
  }
}
