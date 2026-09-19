import { isDeepStrictEqual } from 'node:util'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { StepInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { AgentRun } from '@open-mercato/enterprise/modules/agent_orchestrator/data/entities'
import type { AgencyClientSubmission } from '../../data/entities'
import { CLIENT_TRIAGE_AGENT_ID, clientTriageInterpretationSchema, inputSchema } from '../../agents/client-triage/contract'
import { loadSubmissionMaterial } from './source'

type Contacts = { findById(id: string, tenantId: string, organizationId: string): Promise<{ isActive?: boolean; customerEntityId?: string | null } | null> }
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }

export function createMaterialRevisionBinding(container: AppContainer) {
  return {
    async load(submission: AgencyClientSubmission, interpretation: unknown) {
      const parsed = clientTriageInterpretationSchema.safeParse(interpretation)
      if (!parsed.success || parsed.data.recommendedDisposition !== 'change' || !parsed.data.materialDirective
        || parsed.data.parts.some((part) => part.recommendedDisposition !== 'change' || part.needsClarification || !['material', 'change'].includes(part.intent ?? ''))) return null
      const original = inputSchema.safeParse({ original: submission.original })
      if (!original.success || !original.data.original.materialAttachmentId || !submission.workflowInstanceId
        || original.data.original.reviewResponse || original.data.original.postReviewResponse
        || original.data.original.planReviewResponse || original.data.original.strategyReviewResponse) return null
      const scope = { tenantId: submission.tenantId, organizationId: submission.organizationId }
      const contact = await container.resolve<Contacts>('customerUserService').findById(submission.submittedByCustomerUserId, scope.tenantId, scope.organizationId)
      if (!contact?.isActive || contact.customerEntityId !== submission.customerEntityId) return null
      const em = container.resolve<EntityManager>('em')
      const step = await findOneWithDecryption(em, StepInstance, {
        ...scope, workflowInstanceId: submission.workflowInstanceId, stepId: 'triage', status: 'COMPLETED',
      }, { orderBy: { exitedAt: 'DESC' } }, scope)
      if (!step) return null
      const run = await findOneWithDecryption(em, AgentRun, {
        ...scope, workflowInstanceId: submission.workflowInstanceId, stepId: 'triage', invocationId: step.id,
        agentId: CLIENT_TRIAGE_AGENT_ID, status: 'ok', runtime: 'native', deletedAt: null,
      }, undefined, scope)
      const output = record(run?.output)
      const saved = clientTriageInterpretationSchema.safeParse(output.data)
      const runInput = inputSchema.safeParse(run?.input)
      if (!run || output.kind !== 'research' || !saved.success || !isDeepStrictEqual(saved.data, parsed.data)
        || !runInput.success || !isDeepStrictEqual(runInput.data.original, original.data.original)
        || !('materialContext' in runInput.data) || !runInput.data.materialContext) return null
      const materialContext = runInput.data.materialContext
      const material = await loadSubmissionMaterial(container, submission)
      if (!material || !isDeepStrictEqual(material, materialContext.material)) return null
      return { orderRef: submission.caseId, materialContext, directive: parsed.data.materialDirective,
        source: { submissionId: submission.id, eventId: submission.eventId, customerUserId: submission.submittedByCustomerUserId,
          workflowInstanceId: submission.workflowInstanceId } }
    },
  }
}
