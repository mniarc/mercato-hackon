import { isDeepStrictEqual } from 'node:util'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import type { WorkflowDefinitionAuthoring } from '@open-mercato/core/modules/workflows/lib/owned-definition'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { parseBooleanWithDefault } from '@open-mercato/shared/lib/boolean'
import { AGENCY_RESEARCH_SERVICE } from '@/modules/agency_research/lib/contracts'
import { AgencyCase } from '../../data/entities'
import { AGENCY_CASE_ATTACHMENT_ENTITY_ID, AGENCY_CASE_ATTACHMENT_PARTITION_CODE } from '../contracts'
import { analysisExecutionPolicySchema } from '../analysisProcess/contracts'
import { AGENCY_ANALYSIS_FUNCTION_NAME, AGENCY_ANALYSIS_WORKFLOW_ID, AGENCY_ANALYSIS_WORKER_ID } from '../analysisProcess/workflow'
import { readDemoPurchaseConfiguration } from '../orderBootstrap/configure'
import { purchaseIdentitySchema, type PurchaseIdentity } from '../orderBootstrap/contracts'
import { createNativeDemoSales, readPurchaseBinding } from '../orderBootstrap/nativeSales'
import { createDemoPaymentGateway, isVerifiedDemoCapture } from '../orderBootstrap/payment'
import { DEMO_PURCHASE_WORKFLOW_ID, DEMO_PURCHASE_WORKER_ID } from '../orderBootstrap/workflow'
import { PAID_CASE_ANALYSIS_CONTEXT, paidPurchaseMaterialSchema, paidPurchaseOriginSchema, type PaidCaseProcessing } from './contracts'
import { mapPaidPurchaseMaterial, purchaseMatchesAnalysisProduct } from './material'

type Executor = Pick<typeof import('@open-mercato/core/modules/workflows/lib/workflow-executor'), 'startWorkflow' | 'executeWorkflow'>
function conflict(): never { throw new CrudHttpError(409, { error: 'Paid purchase does not match its case or native process.' }) }

function createPaidCaseAnalysisAccess(container: AppContainer, dispatch: boolean) {
  return async (rawIdentity: PurchaseIdentity, orderId: string): Promise<PaidCaseProcessing> => {
    const identity = purchaseIdentitySchema.parse(rawIdentity)
    const scope = { tenantId: identity.tenantId, organizationId: identity.organizationId }
    const config = await readDemoPurchaseConfiguration(container, scope)
    const sales = createNativeDemoSales(container, config)
    const order = await sales.loadOrder(orderId)
    const binding = readPurchaseBinding(order)
    if (order.customerEntityId !== identity.customerEntityId || binding.customerUserId !== identity.customerUserId
      || !binding.caseId || binding.caseId !== binding.reservedCaseId || !binding.workflowInstanceId) conflict()
    const payment = await sales.loadPayment(orderId)
    const transaction = payment && await createDemoPaymentGateway(container, scope).read(payment.id)
    if (!payment || !transaction || !isVerifiedDemoCapture(order, payment, transaction) || Number(payment.capturedAmount) !== binding.amount) conflict()
    const em = container.resolve<EntityManager>('em').fork()
    const executor = container.resolve<Executor>('workflowExecutor')
    const prepared = await em.transactional(async (tx): Promise<PaidCaseProcessing> => {
      const agencyCase = await findOneWithDecryption(tx, AgencyCase, {
        ...scope, id: binding.caseId, customerEntityId: identity.customerEntityId, submittedByCustomerUserId: identity.customerUserId, deletedAt: null,
      }, dispatch ? { lockMode: LockMode.PESSIMISTIC_WRITE } : undefined, scope)
      if (!agencyCase) conflict()
      const purchaseWorkflow = await findOneWithDecryption(tx, WorkflowInstance, {
        ...scope, id: binding.workflowInstanceId, deletedAt: null,
      }, undefined, scope)
      if (purchaseWorkflow?.workflowId === AGENCY_ANALYSIS_WORKFLOW_ID) {
        // New teammate activation uses the analysis workflow itself; do not
        // run the legacy awaiting-execution bootstrap a second time.
        const origin = z.object({ orderId: z.uuid(), paymentId: z.uuid(), demoOnly: z.literal(true),
          materialHash: z.string().min(1), receiptAttachmentId: z.uuid().optional(), receiptHash: z.string().optional() })
          .safeParse(purchaseWorkflow.context.purchase)
        if (!origin.success || origin.data.orderId !== order.id || origin.data.paymentId !== payment.id
          || purchaseWorkflow.context.caseId !== agencyCase.id || agencyCase.agentWorkerId !== AGENCY_ANALYSIS_WORKER_ID
          || purchaseWorkflow.metadata?.entityType !== 'agency_operations:agency_case' || purchaseWorkflow.metadata.entityId !== agencyCase.id) conflict()
        const current = agencyCase.workflowInstanceId === purchaseWorkflow.id ? purchaseWorkflow : await findOneWithDecryption(tx, WorkflowInstance, {
          ...scope, id: agencyCase.workflowInstanceId, workflowId: AGENCY_ANALYSIS_WORKFLOW_ID, deletedAt: null,
        }, undefined, scope)
        if (!current || current.context.caseId !== agencyCase.id || !isDeepStrictEqual(current.context.purchase, purchaseWorkflow.context.purchase)) conflict()
        if (origin.data.receiptAttachmentId) {
          const receipt = await container.resolve<AttachmentService>('attachmentService').readScoped({
            attachmentId: origin.data.receiptAttachmentId, auth: { sub: config.executionUserId, tenantId: scope.tenantId, orgId: scope.organizationId },
            expectedOwner: { entityId: AGENCY_CASE_ATTACHMENT_ENTITY_ID, recordId: agencyCase.id },
            expectedAssignment: { type: AGENCY_CASE_ATTACHMENT_ENTITY_ID, id: agencyCase.id },
            expectedPartitionCode: AGENCY_CASE_ATTACHMENT_PARTITION_CODE, requirePrivatePartition: true,
          })
          const saved = paidPurchaseMaterialSchema.parse(JSON.parse(receipt.buffer.toString('utf8')))
          if (createHash('sha256').update(receipt.buffer).digest('hex') !== origin.data.receiptHash
            || saved.caseId !== agencyCase.id || saved.orderId !== order.id || saved.paymentId !== payment.id
            || !isDeepStrictEqual(saved.identity, identity) || !isDeepStrictEqual(saved.originalPurchase, binding.originalPurchase)
            || saved.termsAcceptedAt !== binding.termsAcceptedAt) conflict()
        }
        return { state: 'started', workflowInstanceId: current.id, nativeStatus: current.status, replayed: true }
      }
      if (!purchaseWorkflow || purchaseWorkflow.workflowId !== DEMO_PURCHASE_WORKFLOW_ID || purchaseWorkflow.context.caseId !== agencyCase.id || purchaseWorkflow.context.orderId !== order.id
        || purchaseWorkflow.context.paymentId !== payment.id || purchaseWorkflow.context.materialAttachmentId !== agencyCase.materialAttachmentId) conflict()
      const origin = paidPurchaseOriginSchema.parse({ orderId: order.id, paymentId: payment.id,
        purchaseWorkflowInstanceId: purchaseWorkflow.id, materialHash: purchaseWorkflow.context.materialHash })
      if (agencyCase.workflowInstanceId !== purchaseWorkflow.id) {
        const existing = await findOneWithDecryption(tx, WorkflowInstance, {
          ...scope, id: agencyCase.workflowInstanceId, workflowId: AGENCY_ANALYSIS_WORKFLOW_ID, deletedAt: null,
        }, undefined, scope)
        if (!existing || agencyCase.agentWorkerId !== AGENCY_ANALYSIS_WORKER_ID || existing.context.caseId !== agencyCase.id
          || !isDeepStrictEqual(existing.context[PAID_CASE_ANALYSIS_CONTEXT], origin)) conflict()
        return { state: 'started', workflowInstanceId: existing.id, nativeStatus: existing.status, replayed: true }
      }
      if (agencyCase.agentWorkerId !== DEMO_PURCHASE_WORKER_ID) conflict()
      if (!parseBooleanWithDefault(process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED, false)) return { state: 'waiting_configuration', reason: 'execution_disabled' }
      if (!container.hasRegistration(AGENCY_RESEARCH_SERVICE) || !container.hasRegistration('agentWorkflowBridge')) return { state: 'waiting_configuration', reason: 'services_unavailable' }
      const definition = await container.resolve<WorkflowDefinitionAuthoring>('workflowDefinitionAuthoring').findOwnedDefinition(tx, {
        ...scope, workflowId: AGENCY_ANALYSIS_WORKFLOW_ID,
      })
      if (!definition?.enabled || definition.metadata?.generatedBy?.module !== 'agency_operations' || definition.metadata.generatedBy.ownerId !== 'analysis'
        || !['agency_research.manage', 'agent_orchestrator.agents.run'].every((feature) => definition.grantedFeatures?.includes(feature))) {
        return { state: 'waiting_configuration', reason: 'missing_process_configuration' }
      }
      const activities = definition.definition.transitions.flatMap((transition) => transition.activities ?? [])
        .filter((activity) => activity.activityType === 'EXECUTE_FUNCTION' && activity.config.functionName === AGENCY_ANALYSIS_FUNCTION_NAME)
      const policy = activities.length === 1 && activities[0].async === true ? analysisExecutionPolicySchema.safeParse(activities[0].config.args?.policy) : null
      if (!policy?.success) return { state: 'waiting_configuration', reason: 'invalid_process_policy' }
      const material = await container.resolve<AttachmentService>('attachmentService').readScoped({
        attachmentId: agencyCase.materialAttachmentId, auth: { sub: config.executionUserId, tenantId: scope.tenantId, orgId: scope.organizationId },
        expectedOwner: { entityId: AGENCY_CASE_ATTACHMENT_ENTITY_ID, recordId: agencyCase.id },
        expectedAssignment: { type: AGENCY_CASE_ATTACHMENT_ENTITY_ID, id: agencyCase.id },
        expectedPartitionCode: AGENCY_CASE_ATTACHMENT_PARTITION_CODE, requirePrivatePartition: true,
      })
      const purchase = paidPurchaseMaterialSchema.parse(JSON.parse(material.buffer.toString('utf8')))
      if (!isDeepStrictEqual(purchase.originalPurchase, binding.originalPurchase) || purchase.termsAcceptedAt !== binding.termsAcceptedAt
        || purchase.demoOffer.amount !== binding.amount || purchase.demoOffer.currency !== binding.currencyCode) conflict()
      if (!purchaseMatchesAnalysisProduct(purchase, policy.data)) return { state: 'waiting_configuration', reason: 'product_policy_mismatch' }
      mapPaidPurchaseMaterial(material.buffer, origin, { ...identity, caseId: agencyCase.id }, policy.data)
      if (!dispatch) return { state: 'ready', workflowInstanceId: purchaseWorkflow.id }
      const started = await executor.startWorkflow(tx, {
        ...scope, workflowId: definition.workflowId, version: definition.version, correlationKey: `agency-case:${agencyCase.id}`,
        initialContext: { caseId: agencyCase.id, ...scope, customerEntityId: identity.customerEntityId, submittedByCustomerUserId: identity.customerUserId,
          title: agencyCase.title, agentWorkerId: AGENCY_ANALYSIS_WORKER_ID, [PAID_CASE_ANALYSIS_CONTEXT]: origin },
        metadata: { entityType: 'agency_operations:agency_case', entityId: agencyCase.id,
          labels: { agentWorkerId: AGENCY_ANALYSIS_WORKER_ID, purchaseWorkflowInstanceId: purchaseWorkflow.id } },
      })
      agencyCase.workflowInstanceId = started.id
      agencyCase.agentWorkerId = AGENCY_ANALYSIS_WORKER_ID
      agencyCase.updatedAt = new Date()
      await tx.flush()
      return { state: 'started', workflowInstanceId: started.id, nativeStatus: started.status, replayed: false }
    })
    if (prepared.state !== 'started') return prepared
    // A retry may dispatch an instance whose creation committed before interruption;
    // it never resumes paused work or restarts a completed/failed native instance.
    const execution = dispatch && prepared.nativeStatus === 'RUNNING'
      ? await executor.executeWorkflow(em, container, prepared.workflowInstanceId)
      : { status: prepared.nativeStatus }
    if (['FAILED', 'CANCELLED', 'COMPENSATING'].includes(execution.status)) return {
      state: 'attention_required', workflowInstanceId: prepared.workflowInstanceId, reason: 'workflow_not_running', nativeStatus: execution.status,
    }
    return { ...prepared, nativeStatus: execution.status }
  }
}

/** Called only after purchase confirmation commits. Native async research is not executed in the payment transaction. */
export const createPaidCaseAnalysisBootstrap = (container: AppContainer) => createPaidCaseAnalysisAccess(container, true)
/** GET projection only: no execution, records or independently stored lifecycle. */
export const createPaidCaseAnalysisReader = (container: AppContainer) => createPaidCaseAnalysisAccess(container, false)
