import { z } from 'zod'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import type * as NativeSignalHandler from '@open-mercato/core/modules/workflows/lib/signal-handler'
import type { EventBus } from '@open-mercato/events'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService } from '@/modules/agency_research/lib/contracts'
import { AgencyClientSubmission } from '../../data/entities'
import { STAFF_TOV_INTAKE_SERVICE, type StaffTovCompletionHandler, type StaffTovIntakeService } from '../tovIntake/contracts'
import { prepareStrategyExecution } from './activity'
import {
  STRATEGY_EXECUTION_RESULT_KEY, STRATEGY_EXECUTION_STEP_ID, STRATEGY_SPECIALIST_SIGNAL,
  STRATEGY_SPECIALIST_SIGNAL_KEY, STRATEGY_SPECIALIST_WAIT_EVENT, STRATEGY_SPECIALIST_WAIT_STEP_ID, strategySpecialistWaitSchema,
} from './contracts'

const nativeWorkflowId = 'agency_operations.client-submission.native.v1'
const checkSchema = z.object({
  tenantId: z.uuid(), organizationId: z.uuid(), workflowInstanceId: z.uuid(),
  caseId: z.uuid().optional(), specialistWorkflowInstanceId: z.uuid().optional(),
})
export type SpecialistContinuationHandler = StaffTovCompletionHandler & {
  checkWaiting(input: z.infer<typeof checkSchema>): Promise<void>
}

export function createSpecialistContinuationHandler(container: AppContainer): SpecialistContinuationHandler {
  const em = container.resolve<EntityManager>('em')
  async function checkWaiting(rawInput: z.infer<typeof checkSchema>): Promise<void> {
    const input = checkSchema.parse(rawInput)
    const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
    await em.transactional(async (tx) => {
      const workflow = await findOneWithDecryption(tx, WorkflowInstance, {
        ...scope, id: input.workflowInstanceId, workflowId: nativeWorkflowId, deletedAt: null,
      }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
      if (!workflow) return
      const pending = z.object({ result: strategySpecialistWaitSchema }).safeParse(workflow.context?.[STRATEGY_EXECUTION_RESULT_KEY])
      if (!pending.success) return
      const wait = pending.data.result
      if (input.caseId && wait.orderRef !== input.caseId) return
      if (input.specialistWorkflowInstanceId && wait.specialistWorkflowInstanceId
        && wait.specialistWorkflowInstanceId !== input.specialistWorkflowInstanceId) return
      if (workflow.currentStepId !== STRATEGY_SPECIALIST_WAIT_STEP_ID || workflow.status !== 'PAUSED') {
        if (workflow.currentStepId === STRATEGY_EXECUTION_STEP_ID
          && ['RUNNING', 'WAITING_FOR_ACTIVITIES'].includes(workflow.status)
          && !workflow.context?.[STRATEGY_SPECIALIST_SIGNAL_KEY]) {
          throw new Error('[internal] Specialist wait entry is still committing; retry native event delivery')
        }
        return
      }
      const specialist = await container.resolve<StaffTovIntakeService>(STAFF_TOV_INTAKE_SERVICE).resolveForCase({
        ...scope, caseId: wait.orderRef,
        ...(wait.specialistWorkflowInstanceId || input.specialistWorkflowInstanceId
          ? { workflowInstanceId: wait.specialistWorkflowInstanceId ?? input.specialistWorkflowInstanceId } : {}),
      })
      if (specialist.status !== 'ready') return
      const authority = await prepareStrategyExecution(container, {
        userId: wait.executionUserId,
        workflowInstance: { id: workflow.id, workflowId: nativeWorkflowId, ...scope },
      }, tx)
      if (authority.status !== 'authorized' || authority.run.request.orderRef !== wait.orderRef) return
      const allowed = await container.resolve<Pick<RbacService, 'userHasAllFeatures'>>('rbacService')
        .userHasAllFeatures(wait.executionUserId, ['agency_research.manage', 'agent_orchestrator.agents.run'], scope)
      if (!allowed) return
      const request = authority.run.request
      const readiness = await container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE).getStrategyReadiness(scope, {
        orderRef: request.orderRef, briefVersionId: request.briefVersionId,
        acceptanceSubmissionId: request.acceptanceSubmissionId, process: request.process,
      })
      if (readiness.status !== 'ready') return
      await container.resolve<Pick<typeof NativeSignalHandler, 'sendSignal'>>('signalHandler').sendSignal(tx, container, {
        ...scope, instanceId: workflow.id, userId: wait.executionUserId, signalName: STRATEGY_SPECIALIST_SIGNAL,
        payload: { [STRATEGY_SPECIALIST_SIGNAL_KEY]: { workflowInstanceId: specialist.workflowInstanceId } },
      })
    })
  }
  return {
    checkWaiting,
    async complete(input) {
      const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
      const submissions = await findWithDecryption(em, AgencyClientSubmission, {
        ...scope, caseId: input.caseId, deletedAt: null, workflowInstanceId: { $ne: null },
      }, { fields: ['workflowInstanceId'] }, scope)
      for (const workflowInstanceId of new Set(submissions.map(item => item.workflowInstanceId).filter((id): id is string => Boolean(id)))) {
        await checkWaiting({ ...input, workflowInstanceId })
      }
    },
  }
}

/** Queue only: native event retries close the result-read to wait-entry race. */
export function createQueueSpecialistCheckActivity(container: AppContainer) {
  return async (_args: unknown, rawContext: unknown) => {
    const context = z.object({ workflowInstance: z.object({
      id: z.uuid(), tenantId: z.uuid(), organizationId: z.uuid(), workflowId: z.literal(nativeWorkflowId),
    }) }).parse(rawContext)
    const workflow = context.workflowInstance
    await container.resolve<EventBus>('eventBus').emit(STRATEGY_SPECIALIST_WAIT_EVENT, {
      tenantId: workflow.tenantId, organizationId: workflow.organizationId, workflowInstanceId: workflow.id,
    }, { persistent: true, deliverInline: false, tenantId: workflow.tenantId, organizationId: workflow.organizationId })
    return { queued: true }
  }
}
