import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { z } from 'zod'
import { AgencyCase } from '../data/entities'
import { AGENCY_HUMAN_ATTENTION_WORKFLOW_ID } from './humanAttentionWorkflow'

export const AGENCY_HUMAN_ATTENTION_SERVICE = 'agencyHumanAttentionService'

export const humanAttentionRequestSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
  evidence: z.string().trim().max(4000).default(''),
}).strict()

const humanAttentionInputSchema = humanAttentionRequestSchema.extend({
  caseId: z.uuid(), tenantId: z.uuid(), organizationId: z.uuid(), userId: z.uuid(),
})

export type HumanAttentionResult = { caseId: string; workflowInstanceId: string; deduplicated: boolean }
export type AgencyHumanAttentionService = { escalate: (input: z.infer<typeof humanAttentionInputSchema>) => Promise<HumanAttentionResult> }

type WorkflowExecutor = {
  startWorkflow: (em: EntityManager, options: {
    workflowId: string; tenantId: string; organizationId: string; initialContext: Record<string, unknown>;
    correlationKey: string; metadata: { initiatedBy: string; entityType: string; entityId: string };
  }) => Promise<{ id: string }>
  executeWorkflow: (em: EntityManager, container: AppContainer, id: string, context: { userId: string }) => Promise<unknown>
}

export function createAgencyHumanAttentionService(container: AppContainer): AgencyHumanAttentionService {
  return {
    async escalate(rawInput) {
      const input = humanAttentionInputSchema.parse(rawInput)
      const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
      const rbac = container.resolve<Pick<RbacService, 'userHasAllFeatures'>>('rbacService')
      if (!await rbac.userHasAllFeatures(input.userId, ['agency_operations.cases.escalate', 'agency_operations.cases.view', 'customers.companies.view'], scope)) {
        throw new CrudHttpError(403, { error: 'Agency case escalation is not authorized' })
      }
      const em = container.resolve<EntityManager>('em')
      const executor = container.resolve<WorkflowExecutor>('workflowExecutor')
      const started = await em.transactional(async (tx) => {
        const agencyCase = await findOneWithDecryption(tx, AgencyCase, {
          id: input.caseId, ...scope, deletedAt: null,
        }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
        if (!agencyCase) throw new CrudHttpError(404, { error: 'Agency case not found' })
        const correlationKey = `agency-attention:${agencyCase.id}`
        const active = await findOneWithDecryption(tx, WorkflowInstance, {
          workflowId: AGENCY_HUMAN_ATTENTION_WORKFLOW_ID, correlationKey, ...scope,
          status: { $in: ['RUNNING', 'PAUSED', 'WAITING_FOR_ACTIVITIES'] },
        }, undefined, scope)
        if (active) return { caseId: agencyCase.id, workflowInstanceId: active.id, deduplicated: true }
        const instance = await executor.startWorkflow(tx, {
          workflowId: AGENCY_HUMAN_ATTENTION_WORKFLOW_ID, ...scope, correlationKey,
          metadata: { initiatedBy: input.userId, entityType: 'agency_operations:agency_case', entityId: agencyCase.id },
          initialContext: {
            attentionKind: 'agency_case', caseId: agencyCase.id, ...scope,
            title: agencyCase.title, customerEntityId: agencyCase.customerEntityId,
            submittedByCustomerUserId: agencyCase.submittedByCustomerUserId,
            sourceWorkflowInstanceId: agencyCase.workflowInstanceId,
            reason: input.reason, evidence: input.evidence,
            materialFileName: agencyCase.materialFileName, materialMimeType: agencyCase.materialMimeType, materialFileSize: agencyCase.materialFileSize,
          },
        })
        return { caseId: agencyCase.id, workflowInstanceId: instance.id, deduplicated: false }
      })
      await executor.executeWorkflow(em, container, started.workflowInstanceId, { userId: input.userId })
      return started
    },
  }
}
