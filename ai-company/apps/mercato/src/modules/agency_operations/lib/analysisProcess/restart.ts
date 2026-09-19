import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyCase } from '../../data/entities'
import { assertAnalysisProcessConfigured } from './configure'
import { AGENCY_ANALYSIS_WORKER_ID, AGENCY_ANALYSIS_WORKFLOW_ID } from './workflow'

type Executor = Pick<typeof import('@open-mercato/core/modules/workflows/lib/workflow-executor'), 'startWorkflow' | 'executeWorkflow' | 'updateWorkflowContext'>

const inputSchema = z.object({
  tenantId: z.uuid(), organizationId: z.uuid(), userId: z.uuid(), caseId: z.uuid(),
  /** Override the automatic resume point (a chain group: 3.2, 3.5, 3.8, 4.2 …), e.g. to rebuild an earlier document. */
  resumeFrom: z.enum(['3.2', '3.5', '3.8', '4.2', '5.4', '6.7', '7.3', '8.7', '9.3']).optional(),
}).strict()
const TERMINAL = new Set(['FAILED', 'CANCELLED', 'COMPLETED'])

/**
 * Operator recovery for an analysis case whose native workflow ended without
 * the research finishing (a runtime restart mid-step, a crashed activity): the
 * case gets a fresh `analysis.v1` instance bound to it and executed. The research
 * activity itself decides where to continue — stored documents stand, orphaned
 * task runs are marked, spend resumes under the current policy cap. A case
 * whose workflow is still alive is refused: nothing runs twice.
 */
export async function restartAnalysisCase(container: AppContainer, rawInput: unknown): Promise<{ caseId: string; previousWorkflowInstanceId: string | null; workflowInstanceId: string; status: string; currentStep: string }> {
  const input = inputSchema.parse(rawInput)
  const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
  if (!await container.resolve<Pick<RbacService, 'userHasAllFeatures'>>('rbacService').userHasAllFeatures(input.userId, ['agency_research.manage', 'workflows.manage'], scope)) {
    throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
  }
  const definition = await assertAnalysisProcessConfigured(container, scope)
  const em = container.resolve<EntityManager>('em')
  const agencyCase = await findOneWithDecryption(em, AgencyCase, { ...scope, id: input.caseId, deletedAt: null }, undefined, scope)
  if (!agencyCase) throw new CrudHttpError(404, { error: 'api.errors.notFound' })
  if (agencyCase.agentWorkerId !== AGENCY_ANALYSIS_WORKER_ID) throw new CrudHttpError(409, { error: 'Only an analysis case can be restarted' })
  const previous = agencyCase.workflowInstanceId
    ? await findOneWithDecryption(em, WorkflowInstance, { ...scope, id: agencyCase.workflowInstanceId, deletedAt: null }, undefined, scope)
    : null
  const executor = container.resolve<Executor>('workflowExecutor')
  if (previous && previous.status === 'PAUSED' && input.resumeFrom) {
    // Paused on an open exception task: the human decision stays with the employee. The override is written
    // into the live instance so that resolving the task re-enters research from the requested step.
    await executor.updateWorkflowContext(em, previous.id, { restart: { attempt: 0, previousWorkflowInstanceId: null, by: input.userId, at: new Date().toISOString(), resumeFrom: input.resumeFrom } })
    return { caseId: agencyCase.id, previousWorkflowInstanceId: null, workflowInstanceId: previous.id, status: previous.status, currentStep: previous.currentStepId ?? 'research_exception' }
  }
  if (previous && !TERMINAL.has(previous.status)) throw new CrudHttpError(409, { error: `The case workflow is still ${previous.status}; nothing to restart` })
  const attempt = (previous?.correlationKey?.match(/:restart-(\d+)$/)?.[1] ? Number(previous.correlationKey.match(/:restart-(\d+)$/)![1]) : 0) + 1
  const workflow = await executor.startWorkflow(em, {
    ...scope, workflowId: AGENCY_ANALYSIS_WORKFLOW_ID, version: definition.version, correlationKey: `agency-case:${agencyCase.id}:restart-${attempt}`,
    initialContext: {
      caseId: agencyCase.id, tenantId: scope.tenantId, organizationId: scope.organizationId,
      customerEntityId: agencyCase.customerEntityId, submittedByCustomerUserId: agencyCase.submittedByCustomerUserId,
      title: agencyCase.title, agentWorkerId: agencyCase.agentWorkerId,
      materialFileName: agencyCase.materialFileName, materialMimeType: agencyCase.materialMimeType, materialFileSize: agencyCase.materialFileSize,
      restart: { attempt, previousWorkflowInstanceId: previous?.id ?? null, by: input.userId, at: new Date().toISOString(), ...(input.resumeFrom ? { resumeFrom: input.resumeFrom } : {}) },
    },
    metadata: { entityType: 'agency_operations:agency_case', entityId: agencyCase.id, labels: { agentWorkerId: agencyCase.agentWorkerId } },
  })
  agencyCase.workflowInstanceId = workflow.id
  agencyCase.updatedAt = new Date()
  await em.flush()
  const execution = z.object({ status: z.string(), currentStep: z.string() }).parse(await executor.executeWorkflow(em, container, workflow.id))
  return { caseId: agencyCase.id, previousWorkflowInstanceId: previous?.id ?? null, workflowInstanceId: workflow.id, ...execution }
}
