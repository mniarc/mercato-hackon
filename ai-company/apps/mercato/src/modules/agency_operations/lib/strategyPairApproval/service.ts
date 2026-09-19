import { isDeepStrictEqual } from 'node:util'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { UserTask, WorkflowInstance, StepInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { AgentRun } from '@open-mercato/enterprise/modules/agent_orchestrator/data/entities'
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService, type AcceptStrategyPairInput } from '@/modules/agency_research/lib/contracts'
import { AgencyCase, type AgencyClientSubmission } from '../../data/entities'
import { CLIENT_TRIAGE_AGENT_ID, clientTriageInterpretationSchema, inputSchema } from '../../agents/client-triage/contract'
import { NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID } from '../../agents/client-triage/workflow'
import { projectClientTriageResult } from '../../agents/client-triage/projectResult'
import { strategyPairEventId } from '../strategyPairReview/service'
import {
  STRATEGY_PAIR_REVIEW_CONTEXT_KEY, STRATEGY_PAIR_REVIEW_WORKFLOW_ID,
  STRATEGY_PAIR_RESPONSE_CONTEXT_KEY, strategyPairInvitationSchema, strategyPairRequestSchema,
} from '../strategyPairReview/contracts'

type Contacts = {
  findById(id: string, tenantId: string, organizationId: string): Promise<{ isActive?: boolean; customerEntityId?: string | null } | null>
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function createStrategyPairApproval(container: AppContainer) {
  async function load(submission: AgencyClientSubmission, interpretation: unknown): Promise<AcceptStrategyPairInput['request'] | null> {
    const preserved = inputSchema.safeParse({ original: submission.original })
    if (!preserved.success || !submission.workflowInstanceId) return null
    const response = preserved.data.original.strategyReviewResponse
    if (!response || response.kind !== 'approval' || !response.approvedDocuments?.length) return null
    const candidate = projectClientTriageResult({
      tenantId: submission.tenantId, organizationId: submission.organizationId,
      customerEntityId: submission.customerEntityId, caseId: submission.caseId,
      submissionId: submission.id, workflowInstanceId: submission.workflowInstanceId,
    }, interpretation, ['strategy_pair_decision'])
    if (candidate.disposition?.kind !== 'approve' || candidate.disposition.targetStepId !== 'strategy_pair_decision') return null
    const original = strategyPairRequestSchema.safeParse(Object.fromEntries(Object.entries(response).filter(([key]) => key !== 'taskId')))
    if (!original.success || preserved.data.original.documentVersionReference !== response.strategy.versionId
      || submission.eventId !== strategyPairEventId(response.taskId, response.externalEventId)
      || preserved.data.original.eventId !== submission.eventId) return null
    const scope = { tenantId: submission.tenantId, organizationId: submission.organizationId }
    const em = container.resolve<EntityManager>('em')
    const agencyCase = await findOneWithDecryption(em, AgencyCase, {
      id: submission.caseId, ...scope, customerEntityId: submission.customerEntityId, deletedAt: null,
    }, undefined, scope)
    if (!agencyCase) return null
    const task = await findOneWithDecryption(em, UserTask, {
      id: response.taskId, ...scope, status: 'COMPLETED', assigneeKind: 'customer',
      assignedTo: submission.submittedByCustomerUserId, completedBy: submission.submittedByCustomerUserId,
    }, undefined, scope)
    if (!task || !isDeepStrictEqual(record(task.formData)[STRATEGY_PAIR_RESPONSE_CONTEXT_KEY], original.data)) return null
    const invitationWorkflow = await findOneWithDecryption(em, WorkflowInstance, {
      id: task.workflowInstanceId, workflowId: STRATEGY_PAIR_REVIEW_WORKFLOW_ID, ...scope, deletedAt: null,
    }, undefined, scope)
    const invitation = strategyPairInvitationSchema.safeParse(invitationWorkflow?.context[STRATEGY_PAIR_REVIEW_CONTEXT_KEY])
    if (!invitation.success || invitation.data.caseId !== submission.caseId || invitation.data.review.caseId !== submission.caseId
      || invitation.data.customerEntityId !== submission.customerEntityId || invitation.data.customerUserId !== submission.submittedByCustomerUserId
      || invitation.data.review.strategy.documentId !== response.strategy.documentId || invitation.data.review.strategy.versionId !== response.strategy.versionId
      || invitation.data.review.tov.documentId !== response.tov.documentId || invitation.data.review.tov.versionId !== response.tov.versionId) return null
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
    if (!run || output.kind !== 'research' || !saved.success || !isDeepStrictEqual(saved.data, interpretation)
      || !runInput.success || !isDeepStrictEqual(runInput.data, preserved.data)) return null
    return {
      orderRef: submission.caseId, pair: { strategy: response.strategy, tov: response.tov },
      approvedDocuments: [...response.approvedDocuments], customerUserId: submission.submittedByCustomerUserId,
      source: { submissionId: submission.id, eventId: submission.eventId, workflowInstanceId: submission.workflowInstanceId, agentRunId: run.id, invitationTaskId: task.id },
    }
  }

  async function authorizedRequest(submission: AgencyClientSubmission, interpretation: unknown) {
    const request = await load(submission, interpretation)
    if (!request) throw new Error('[internal] Strategy pair approval requires the exact authorized review original and saved native triage decision')
    return request
  }

  return {
    load,
    async accept(submission: AgencyClientSubmission, interpretation: unknown) {
      const request = await authorizedRequest(submission, interpretation)
      const scope = { tenantId: submission.tenantId, organizationId: submission.organizationId }
      const em = container.resolve<EntityManager>('em')
      const workflow = await findOneWithDecryption(em, WorkflowInstance, {
        id: submission.workflowInstanceId!, workflowId: NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID, ...scope, deletedAt: null,
      }, undefined, scope)
      if (!workflow) throw new Error('[internal] Strategy pair approval requires the native client submission workflow')
      const userId = await resolveWorkflowPrincipalUserId(em, workflow)
      if (!userId) throw new Error('[internal] Strategy pair approval requires the native workflow principal')
      return container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE).acceptStrategyPair({ context: { ...scope, userId }, request })
    },
    async getAcceptance(submission: AgencyClientSubmission, interpretation: unknown) {
      const request = await authorizedRequest(submission, interpretation)
      return container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE).getStrategyPairAcceptance(
        { tenantId: submission.tenantId, organizationId: submission.organizationId },
        { orderRef: request.orderRef, strategyVersionId: request.pair.strategy.versionId, tovVersionId: request.pair.tov.versionId },
      )
    },
  }
}
