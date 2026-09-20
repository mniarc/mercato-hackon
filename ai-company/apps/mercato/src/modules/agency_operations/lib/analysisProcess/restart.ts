import { z } from 'zod'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { UserTask, WorkflowInstance, WorkflowDefinition } from '@open-mercato/core/modules/workflows/data/entities'
import { AgentRun } from '@open-mercato/enterprise/modules/agent_orchestrator/data/entities'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService } from '@/modules/agency_research/lib/contracts'
import { AgencyCase, AgencyClientSubmission } from '../../data/entities'
import { PAID_CASE_ANALYSIS_CONTEXT } from '../paidCaseAnalysis/contracts'
import { BRIEF_REVIEW_CONTEXT_KEY, BRIEF_REVIEW_STEP_ID, BRIEF_REVIEW_WORKFLOW_ID } from '../briefStrategyProcess/contracts'
import { briefReviewStatus } from '../briefStrategyProcess/review'
import { assertAnalysisExecutionEnabled } from './activity'
import { analysisIntakeSteps, analysisExecutionPolicySchema } from './contracts'
import { AGENCY_ANALYSIS_FUNCTION_NAME, AGENCY_ANALYSIS_WORKER_ID, AGENCY_ANALYSIS_WORKFLOW_ID } from './workflow'
import { SOURCE_CORRECTION_KEY, SOURCE_RESPONSE_STEP, sourceCorrectionSchema } from '../sourceClarification/contracts'
import { readCompletedSourceCorrection } from '../sourceClarification/recovery'

type Executor = Pick<typeof import('@open-mercato/core/modules/workflows/lib/workflow-executor'), 'startWorkflow' | 'executeWorkflow' | 'updateWorkflowContext' | 'completeWorkflow'>

const inputSchema = z.object({
  tenantId: z.uuid(), organizationId: z.uuid(), userId: z.uuid(), caseId: z.uuid(),
  /** Explicit intake recovery point, still bounded by the original process policy. */
  resumeFrom: z.enum(analysisIntakeSteps).optional(),
  expectedWorkflowInstanceId: z.uuid().optional(),
}).strict()
const TERMINAL = new Set(['FAILED', 'CANCELLED', 'COMPLETED'])

/**
 * Operator recovery for an analysis case whose native workflow ended without
 * the research finishing (a runtime restart mid-step, a crashed activity): the
 * case gets a fresh `analysis.v1` instance bound to it and executed. The research
 * activity itself decides where to continue — stored documents stand, orphaned
 * task runs are marked, spend resumes under the original pinned policy cap. A case
 * whose workflow is still alive is refused: nothing runs twice.
 */
export async function restartAnalysisCase(container: AppContainer, rawInput: unknown): Promise<{ caseId: string; previousWorkflowInstanceId: string | null; workflowInstanceId: string; status: string; currentStep: string }> {
  const input = inputSchema.parse(rawInput)
  assertAnalysisExecutionEnabled()
  const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
  if (!await container.resolve<Pick<RbacService, 'userHasAllFeatures'>>('rbacService').userHasAllFeatures(input.userId, ['agency_research.manage', 'workflows.manage'], scope)) {
    throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
  }
  const em = container.resolve<EntityManager>('em')
  const executor = container.resolve<Executor>('workflowExecutor')
  const prepared = await em.transactional(async (tx) => {
    const agencyCase = await findOneWithDecryption(tx, AgencyCase, { ...scope, id: input.caseId, deletedAt: null }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
    if (!agencyCase) throw new CrudHttpError(404, { error: 'api.errors.notFound' })
    if (agencyCase.agentWorkerId !== AGENCY_ANALYSIS_WORKER_ID) throw new CrudHttpError(409, { error: 'Only an analysis case can be restarted' })
    const previous = agencyCase.workflowInstanceId
      ? await findOneWithDecryption(tx, WorkflowInstance, { ...scope, id: agencyCase.workflowInstanceId, workflowId: AGENCY_ANALYSIS_WORKFLOW_ID, deletedAt: null }, undefined, scope)
      : null
    if (!previous) throw new CrudHttpError(409, { error: 'A terminal analysis workflow is required before restart.' })
    if (input.expectedWorkflowInstanceId && input.expectedWorkflowInstanceId !== previous.id) {
      throw new CrudHttpError(409, { error: 'The analysis workflow changed; reload the case before restarting.' })
    }
    const sourceCorrection = previous.currentStepId === SOURCE_RESPONSE_STEP
      ? await readCompletedSourceCorrection(tx, scope, agencyCase, previous) : null
    if (previous.currentStepId === SOURCE_RESPONSE_STEP && (!sourceCorrection || (input.resumeFrom && input.resumeFrom !== '3.2'))) {
      throw new CrudHttpError(409, { error: 'Source recovery requires the saved customer correction and restart from source collection.' })
    }
    const resumeFrom = sourceCorrection ? '3.2' as const : input.resumeFrom
    const inheritedCorrection = sourceCorrectionSchema.safeParse(previous.context[SOURCE_CORRECTION_KEY])
    // A persisted running provider invocation is not proof the process died.
    // Refuse unresolved activity, including a parallel client-response worker.
    const submissions = await findWithDecryption(tx, AgencyClientSubmission, { ...scope, caseId: agencyCase.id, deletedAt: null }, { fields: ['workflowInstanceId'] }, scope)
    const workflowIds = [previous.id, ...submissions.flatMap((submission) => submission.workflowInstanceId ? [submission.workflowInstanceId] : [])]
    const active = await findOneWithDecryption(tx, AgentRun, { ...scope, workflowInstanceId: { $in: workflowIds }, status: 'running', deletedAt: null }, undefined, scope)
    if (active) throw new CrudHttpError(409, { error: 'A provider invocation is still recorded as running; reconcile it before restarting analysis.' })
    const definition = await findOneWithDecryption(tx, WorkflowDefinition, { ...scope, id: previous.definitionId,
      workflowId: previous.workflowId, version: previous.version, deletedAt: null }, undefined, scope)
    if (!definition?.enabled || definition.metadata?.generatedBy?.module !== 'agency_operations' || definition.metadata.generatedBy.ownerId !== 'analysis') {
      throw new CrudHttpError(409, { error: 'The original pinned analysis definition is unavailable.' })
    }
    if (resumeFrom) {
      const activities = definition.definition.transitions.flatMap((transition) => transition.activities ?? [])
        .filter((activity) => activity.activityType === 'EXECUTE_FUNCTION' && activity.config.functionName === AGENCY_ANALYSIS_FUNCTION_NAME)
      const policy = activities.length === 1 ? analysisExecutionPolicySchema.safeParse(activities[0].config.args?.policy) : null
      if (!policy?.success || analysisIntakeSteps.indexOf(resumeFrom) > analysisIntakeSteps.indexOf(policy.data.through)) {
        throw new CrudHttpError(409, { error: 'The requested resume point is outside the original pinned analysis policy.' })
      }
    }
    if (previous.status === 'PAUSED' && input.resumeFrom && previous.currentStepId === 'research_exception') {
      // Preserve the employee's open exception task. Its eventual decision resumes the same
      // pinned workflow, now from the explicitly bounded research step.
      await executor.updateWorkflowContext(tx, previous.id, { restart: {
        attempt: 0, previousWorkflowInstanceId: null, by: input.userId, at: new Date().toISOString(), resumeFrom: input.resumeFrom,
      } })
      return { execute: false as const, caseId: agencyCase.id, previousWorkflowInstanceId: null,
        workflowInstanceId: previous.id, status: previous.status, currentStep: previous.currentStepId }
    }
    if (previous.status === 'PAUSED' && input.resumeFrom && previous.currentStepId === 'waiting') {
      const handoff = z.object({ result: z.object({ invitation: z.object({ workflowInstanceId: z.uuid(), taskId: z.uuid() }) }) })
        .safeParse(previous.context.agencyBriefInvitation)
      let reviewWorkflow: WorkflowInstance | null = null
      let openTasks: UserTask[]
      if (handoff.success) {
        const invitation = handoff.data.result.invitation
        reviewWorkflow = await findOneWithDecryption(tx, WorkflowInstance, {
          ...scope, id: invitation.workflowInstanceId, workflowId: BRIEF_REVIEW_WORKFLOW_ID,
          status: 'PAUSED', currentStepId: BRIEF_REVIEW_STEP_ID, deletedAt: null,
        }, undefined, scope)
        const binding = z.object({ caseId: z.uuid(), customerEntityId: z.uuid(), customerUserId: z.uuid(),
          review: z.object({ documentId: z.uuid(), versionId: z.uuid() }),
        })
          .safeParse(reviewWorkflow?.context[BRIEF_REVIEW_CONTEXT_KEY])
        if (!reviewWorkflow || !binding.success || binding.data.caseId !== agencyCase.id
          || binding.data.customerEntityId !== agencyCase.customerEntityId
          || binding.data.customerUserId !== agencyCase.submittedByCustomerUserId) {
          throw new CrudHttpError(409, { error: 'The saved client review is no longer available for analysis recovery.' })
        }
        const current = await container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE)
          .getBriefReview(scope, agencyCase.id, binding.data.review.versionId)
        if (!current?.isCurrent || current.documentId !== binding.data.review.documentId
          || current.versionId !== binding.data.review.versionId || !briefReviewStatus(current)) {
          throw new CrudHttpError(409, { error: 'Only the current unaccepted brief review can be superseded for analysis recovery.' })
        }
        openTasks = await tx.find(UserTask, { ...scope, id: invitation.taskId, workflowInstanceId: reviewWorkflow.id,
          assigneeKind: 'customer', assignedTo: binding.data.customerUserId, status: 'PENDING',
        }, { lockMode: LockMode.PESSIMISTIC_WRITE })
      } else {
        // Older definitions placed the review on the analysis instance itself.
        openTasks = await tx.find(UserTask, { ...scope, workflowInstanceId: previous.id, status: 'PENDING' },
          { lockMode: LockMode.PESSIMISTIC_WRITE })
      }
      if (openTasks.length === 0) throw new CrudHttpError(409, { error: 'An open client review task is required before rebuilding analysis.' })
      if (reviewWorkflow) await executor.completeWorkflow(tx, container, reviewWorkflow.id, 'CANCELLED')
      await executor.completeWorkflow(tx, container, previous.id, 'CANCELLED')
      for (const task of openTasks) { task.status = 'CANCELLED'; task.updatedAt = new Date() }
      await tx.flush()
    } else if (!TERMINAL.has(previous.status)) {
      throw new CrudHttpError(409, { error: `The case workflow is still ${previous.status}; nothing to restart` })
    }
    const attempt = (previous.correlationKey?.match(/:restart-(\d+)$/)?.[1] ? Number(previous.correlationKey.match(/:restart-(\d+)$/)![1]) : 0) + 1
    const workflow = await executor.startWorkflow(tx, {
      ...scope, workflowId: AGENCY_ANALYSIS_WORKFLOW_ID, version: definition.version, correlationKey: `agency-case:${agencyCase.id}:restart-${attempt}`,
      initialContext: {
        caseId: agencyCase.id, tenantId: scope.tenantId, organizationId: scope.organizationId,
        customerEntityId: agencyCase.customerEntityId, submittedByCustomerUserId: agencyCase.submittedByCustomerUserId,
        title: agencyCase.title, agentWorkerId: agencyCase.agentWorkerId,
        materialFileName: agencyCase.materialFileName, materialMimeType: agencyCase.materialMimeType, materialFileSize: agencyCase.materialFileSize,
        ...(previous.context[PAID_CASE_ANALYSIS_CONTEXT] ? { [PAID_CASE_ANALYSIS_CONTEXT]: previous.context[PAID_CASE_ANALYSIS_CONTEXT] } : {}),
        ...(previous.context.purchase ? { purchase: previous.context.purchase } : {}),
        ...(sourceCorrection || inheritedCorrection.success
          ? { [SOURCE_CORRECTION_KEY]: sourceCorrection ?? (inheritedCorrection.success ? inheritedCorrection.data : undefined) } : {}),
        restart: { attempt, previousWorkflowInstanceId: previous.id, by: input.userId, at: new Date().toISOString(), ...(resumeFrom ? { resumeFrom } : {}) },
      },
      metadata: { entityType: 'agency_operations:agency_case', entityId: agencyCase.id, labels: { agentWorkerId: agencyCase.agentWorkerId } },
    })
    agencyCase.workflowInstanceId = workflow.id
    agencyCase.updatedAt = new Date()
    await tx.flush()
    return { execute: true as const, caseId: agencyCase.id, previousWorkflowInstanceId: previous.id, workflowInstanceId: workflow.id }
  })
  if (!prepared.execute) return prepared
  const execution = z.object({ status: z.string(), currentStep: z.string() }).parse(await executor.executeWorkflow(em, container, prepared.workflowInstanceId))
  return { caseId: prepared.caseId, previousWorkflowInstanceId: prepared.previousWorkflowInstanceId,
    workflowInstanceId: prepared.workflowInstanceId, ...execution }
}
