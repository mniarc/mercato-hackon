import { z } from 'zod'
import { isDeepStrictEqual } from 'node:util'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { parseBooleanWithDefault } from '@open-mercato/shared/lib/boolean'
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService } from '@/modules/agency_research/lib/contracts'
import { AgencyCase } from '../../data/entities'
import { AGENCY_CASE_ATTACHMENT_ENTITY_ID, AGENCY_CASE_ATTACHMENT_PARTITION_CODE } from '../contracts'
import { analysisMaterialSchema, analysisExecutionPolicySchema, analysisProcessResultSchema, type AnalysisProcessResult } from './contracts'
import { AGENCY_ANALYSIS_RESULT_KEY, AGENCY_ANALYSIS_WORKFLOW_ID } from './workflow'
import { PAID_CASE_ANALYSIS_CONTEXT } from '../paidCaseAnalysis/contracts'
import { mapPaidPurchaseMaterial } from '../paidCaseAnalysis/material'
import { loadCaseMaterialSources } from './materialSources'

export function assertAnalysisExecutionEnabled(): void {
  if (!parseBooleanWithDefault(process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED, false)) {
    throw new CrudHttpError(409, { error: 'Agency analysis execution is not enabled' })
  }
}

export function parseAnalysisMaterial(buffer: Buffer) {
  if (buffer.length > 1024 * 1024) throw new CrudHttpError(400, { error: 'Analysis material must be at most 1 MiB' })
  let raw: unknown
  try { raw = JSON.parse(buffer.toString('utf8')) } catch {
    throw new CrudHttpError(400, { error: 'Analysis material must be JSON containing the approved order and source inputs' })
  }
  const material = analysisMaterialSchema.safeParse(raw)
  if (!material.success) throw new CrudHttpError(400, { error: 'Analysis requires explicit approved order data and product topic limit' })
  return material.data
}

const inputSchema = z.object({ caseId: z.uuid(), policy: analysisExecutionPolicySchema })
const contextSchema = z.object({
  userId: z.uuid(), stepInstanceId: z.uuid().optional(),
  workflowInstance: z.object({
    id: z.uuid(), workflowId: z.literal(AGENCY_ANALYSIS_WORKFLOW_ID),
    tenantId: z.uuid(), organizationId: z.uuid(), status: z.string(),
    context: z.record(z.string(), z.unknown()),
  }),
})

export function createAnalysisWorkflowActivity(container: AppContainer) {
  return async (rawInput: unknown, rawContext: unknown): Promise<AnalysisProcessResult> => {
    assertAnalysisExecutionEnabled()
    const input = inputSchema.parse(rawInput)
    const context = contextSchema.parse(rawContext)
    const scope = { tenantId: context.workflowInstance.tenantId, organizationId: context.workflowInstance.organizationId }
    const agencyCase = await findOneWithDecryption(container.resolve<EntityManager>('em'), AgencyCase, {
      id: input.caseId, ...scope, workflowInstanceId: context.workflowInstance.id, deletedAt: null,
    }, undefined, scope)
    if (!agencyCase) throw new CrudHttpError(404, { error: 'api.errors.notFound' })
    const saved = z.object({ result: analysisProcessResultSchema }).safeParse(context.workflowInstance.context[AGENCY_ANALYSIS_RESULT_KEY] ?? context.workflowInstance.context.agencyAnalysisResult)
    if (saved.success && saved.data.result.caseId === agencyCase.id && saved.data.result.requestedThrough === input.policy.through) return saved.data.result
    if (['COMPLETED', 'FAILED', 'CANCELLED', 'COMPENSATING'].includes(context.workflowInstance.status)) {
      throw new Error('[internal] Analysis cannot restart a terminal workflow')
    }
    const material = await container.resolve<AttachmentService>('attachmentService').readScoped({
      attachmentId: agencyCase.materialAttachmentId,
      auth: { sub: context.userId, tenantId: scope.tenantId, orgId: scope.organizationId },
      expectedOwner: { entityId: AGENCY_CASE_ATTACHMENT_ENTITY_ID, recordId: agencyCase.id },
      expectedAssignment: { type: AGENCY_CASE_ATTACHMENT_ENTITY_ID, id: agencyCase.id },
      expectedPartitionCode: AGENCY_CASE_ATTACHMENT_PARTITION_CODE, requirePrivatePartition: true,
    })
    const purchaseOrigin = context.workflowInstance.context[PAID_CASE_ANALYSIS_CONTEXT]
    const parsed = purchaseOrigin === undefined ? parseAnalysisMaterial(material.buffer)
      : mapPaidPurchaseMaterial(material.buffer, purchaseOrigin, { caseId: agencyCase.id, ...scope,
        customerEntityId: agencyCase.customerEntityId, customerUserId: agencyCase.submittedByCustomerUserId }, input.policy)
    if (!isDeepStrictEqual(parsed.order.product_selection, input.policy.productSelection)) {
      throw new CrudHttpError(409, { error: 'Material product selection differs from the configured agency analysis policy' })
    }
    const service = container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE)
    // The public service cannot yet resume/deduplicate an invocation. If a crash
    // left persisted research without the native activity result, stop instead
    // of charging for a second whole analysis or inventing a partial replay.
    const previous = await service.status(scope, agencyCase.id)
    if (previous.taskRuns.length) throw new CrudHttpError(409, { error: 'Research already exists for this case; reconcile the existing task runs before starting another analysis' })
    const materialSources = await loadCaseMaterialSources(container, scope, agencyCase.id, context.userId)
    const result = await service.run({
      context: {
        ...scope, userId: context.userId, workflowInstanceId: context.workflowInstance.id, stepId: 'research',
        ...(context.stepInstanceId ? { invocationId: context.stepInstanceId } : {}),
      },
      request: { ...parsed, materialSources, orderRef: agencyCase.id, through: input.policy.through, maxCostPln: input.policy.maxCostPln },
    })
    const completed = result.completedThrough === input.policy.through
      && (input.policy.through === '3.2' || input.policy.through === '3.5' || result.qaVerdict === 'ready')
      && (input.policy.through !== '4.2' || result.briefQaVerdict === 'ready_for_approval')
      && !result.escalationVersionId
    return { ...result, caseId: agencyCase.id, requestedThrough: input.policy.through, state: completed ? 'completed' : 'waiting' }
  }
}
