import { z } from 'zod'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { WorkflowInstance, WorkflowDefinition } from '@open-mercato/core/modules/workflows/data/entities'
import { AgentRun } from '@open-mercato/enterprise/modules/agent_orchestrator/data/entities'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyCase, AgencyClientSubmission } from '../../data/entities'
import { PAID_CASE_ANALYSIS_CONTEXT } from '../paidCaseAnalysis/contracts'
import { assertAnalysisExecutionEnabled } from './activity'
import { AGENCY_ANALYSIS_WORKER_ID, AGENCY_ANALYSIS_WORKFLOW_ID } from './workflow'

type Executor = Pick<typeof import('@open-mercato/core/modules/workflows/lib/workflow-executor'), 'startWorkflow' | 'executeWorkflow'>

const inputSchema = z.object({ tenantId: z.uuid(), organizationId: z.uuid(), userId: z.uuid(), caseId: z.uuid() }).strict()
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
    if (!previous || !TERMINAL.has(previous.status)) throw new CrudHttpError(409, { error: 'A terminal analysis workflow is required before restart.' })
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
        restart: { attempt, previousWorkflowInstanceId: previous.id, by: input.userId, at: new Date().toISOString() },
      },
      metadata: { entityType: 'agency_operations:agency_case', entityId: agencyCase.id, labels: { agentWorkerId: agencyCase.agentWorkerId } },
    })
    agencyCase.workflowInstanceId = workflow.id
    agencyCase.updatedAt = new Date()
    await tx.flush()
    return { caseId: agencyCase.id, previousWorkflowInstanceId: previous.id, workflowInstanceId: workflow.id }
  })
  const execution = z.object({ status: z.string(), currentStep: z.string() }).parse(await executor.executeWorkflow(em, container, prepared.workflowInstanceId))
  return { ...prepared, ...execution }
}
