import { isDeepStrictEqual } from 'node:util'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { UserTask, WorkflowInstance, StepInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { AgentRun } from '@open-mercato/enterprise/modules/agent_orchestrator/data/entities'
import type { AgencyClientSubmission } from '../../data/entities'
import { CLIENT_TRIAGE_AGENT_ID, clientTriageInterpretationSchema, inputSchema } from '../../agents/client-triage/contract'
import { postReviewEventId } from '../postReview/service'
import { POST_REVIEW_CONTEXT_KEY, POST_REVIEW_WORKFLOW_ID, POST_RESPONSE_CONTEXT_KEY, postReviewInvitationSchema, postReviewRequestSchema } from '../postReview/contracts'

type Contacts = { findById(id: string, tenantId: string, organizationId: string): Promise<{ isActive?: boolean; customerEntityId?: string | null } | null> }
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }

export function createPostRevisionBinding(container: AppContainer) {
  return {
    async load(submission: AgencyClientSubmission, interpretation: unknown) {
      const parsed = clientTriageInterpretationSchema.safeParse(interpretation)
      if (!parsed.success || parsed.data.recommendedDisposition !== 'change'
        || parsed.data.parts.some((part) => part.recommendedDisposition !== 'change' || part.needsClarification || part.intent !== 'change')) return null
      const preserved = inputSchema.safeParse({ original: submission.original })
      if (!preserved.success || !submission.workflowInstanceId) return null
      const response = preserved.data.original.postReviewResponse
      if (!response || response.kind !== 'message') return null
      const original = postReviewRequestSchema.safeParse(Object.fromEntries(Object.entries(response).filter(([key]) => key !== 'taskId')))
      if (!original.success || !original.data.body || preserved.data.original.text !== original.data.body
        || preserved.data.original.documentVersionReference !== response.post.versionId
        || submission.eventId !== postReviewEventId(response.taskId, response.externalEventId)) return null
      const scope = { tenantId: submission.tenantId, organizationId: submission.organizationId }
      const em = container.resolve<EntityManager>('em')
      const task = await findOneWithDecryption(em, UserTask, {
        id: response.taskId, ...scope, status: 'COMPLETED', assigneeKind: 'customer',
        assignedTo: submission.submittedByCustomerUserId, completedBy: submission.submittedByCustomerUserId,
      }, undefined, scope)
      if (!task || !isDeepStrictEqual(record(task.formData)[POST_RESPONSE_CONTEXT_KEY], original.data)) return null
      const invitationWorkflow = await findOneWithDecryption(em, WorkflowInstance, {
        id: task.workflowInstanceId, workflowId: POST_REVIEW_WORKFLOW_ID, ...scope, deletedAt: null,
      }, undefined, scope)
      const invitation = postReviewInvitationSchema.safeParse(invitationWorkflow?.context[POST_REVIEW_CONTEXT_KEY])
      if (!invitation.success || invitation.data.caseId !== submission.caseId || invitation.data.review.caseId !== submission.caseId
        || invitation.data.customerEntityId !== submission.customerEntityId || invitation.data.customerUserId !== submission.submittedByCustomerUserId
        || invitation.data.review.post.documentId !== response.post.documentId || invitation.data.review.post.versionId !== response.post.versionId) return null
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
      const output = record(run?.output)
      const saved = clientTriageInterpretationSchema.safeParse(output.data)
      const runInput = inputSchema.safeParse(run?.input)
      if (!run || output.kind !== 'research' || !saved.success || !isDeepStrictEqual(saved.data, parsed.data)
        || !runInput.success || !isDeepStrictEqual(runInput.data, preserved.data)) return null
      return {
        orderRef: submission.caseId, postVersionId: response.post.versionId, originalText: original.data.body,
        source: { submissionId: submission.id, eventId: submission.eventId, customerUserId: submission.submittedByCustomerUserId,
          workflowInstanceId: submission.workflowInstanceId, invitationTaskId: task.id, agentRunId: run.id },
      }
    },
  }
}
