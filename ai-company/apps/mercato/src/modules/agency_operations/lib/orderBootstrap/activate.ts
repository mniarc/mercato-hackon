import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import type { WorkflowDefinitionAuthoring } from '@open-mercato/core/modules/workflows/lib/owned-definition'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyCase } from '../../data/entities'
import { AGENCY_CASE_ATTACHMENT_ENTITY_ID, AGENCY_CASE_ATTACHMENT_PARTITION_CODE } from '../contracts'
import { demoPurchaseRequestSchema, purchaseIdentitySchema, type ActivatePaidPurchase } from './contracts'
import { demoOffer } from './demoOffer'
import { DEMO_PURCHASE_WORKER_ID, DEMO_PURCHASE_WORKFLOW_ID } from './workflow'
import { AGENCY_ANALYSIS_WORKER_ID } from '../analysisProcess/workflow'
import { buildAnalysisMaterial, readAnalysisLaunch, type AnalysisLaunch } from './analysisLaunch'

type Executor = Pick<typeof import('@open-mercato/core/modules/workflows/lib/workflow-executor'), 'startWorkflow' | 'executeWorkflow'>
const activationSchema = z.object({
  identity: purchaseIdentitySchema, caseId: z.uuid(), orderId: z.uuid(), paymentId: z.uuid(),
  originalPurchase: demoPurchaseRequestSchema, termsAcceptedAt: z.string().datetime({ offset: true }),
})
function conflict(): never { throw new CrudHttpError(409, { error: 'api.errors.conflict' }) }

export function createActivatePaidPurchase(container: AppContainer): ActivatePaidPurchase {
  return async (rawInput) => {
    const input = activationSchema.parse(rawInput)
    const { identity, caseId, orderId, paymentId, originalPurchase, termsAcceptedAt } = input
    const scope = { tenantId: identity.tenantId, organizationId: identity.organizationId }
    if (originalPurchase.offerVersion !== demoOffer.offerVersion || originalPurchase.termsVersion !== demoOffer.termsVersion) conflict()
    // Native scoped attachment upload nests in the purchase transaction; its
    // persistLink case must be visible here before the outer commit.
    const em = container.resolve<EntityManager>('em').fork({ keepTransactionContext: true })
    const authoring = container.resolve<WorkflowDefinitionAuthoring>('workflowDefinitionAuthoring')
    // With a published analysis policy and execution enabled, the paid case IS the analysis case:
    // its material is the research order built from the purchase form, its workflow is analysis.v1.
    const launch = await readAnalysisLaunch(container, scope)
    if (launch) return activateAnalysis({ container, em, scope, launch, input })
    const definition = await authoring.findOwnedDefinition(em, { ...scope, workflowId: DEMO_PURCHASE_WORKFLOW_ID })
    if (!definition?.enabled || definition.metadata?.generatedBy?.module !== 'agency_operations' || definition.metadata.generatedBy.ownerId !== 'demo_purchase') conflict()
    const buffer = Buffer.from(JSON.stringify({ demoOnly: true, identity, caseId, orderId, paymentId, originalPurchase, demoOffer, termsAcceptedAt }), 'utf8')
    const materialHash = createHash('sha256').update(buffer).digest('hex')
    const fileName = `demo-purchase-${materialHash}.json`
    const mimeType = 'application/json'
    const loadCase = () => findOneWithDecryption(em, AgencyCase, { ...scope, id: caseId, deletedAt: null }, undefined, scope)
    let agencyCase = await loadCase()
    if (!agencyCase) {
      await container.resolve<AttachmentService>('attachmentService').createScoped({
        ...scope, entityId: AGENCY_CASE_ATTACHMENT_ENTITY_ID, recordId: caseId,
        partitionCode: AGENCY_CASE_ATTACHMENT_PARTITION_CODE, fileName, declaredMimeType: mimeType, buffer,
        assignments: [{ type: AGENCY_CASE_ATTACHMENT_ENTITY_ID, id: caseId }],
        persistLink: (tx, attachmentId) => {
          tx.persist(tx.create(AgencyCase, {
            ...scope, id: caseId, customerEntityId: identity.customerEntityId, submittedByCustomerUserId: identity.customerUserId,
            title: `${demoOffer.name}: ${originalPurchase.buyer.brandDisplayName}`,
            agentWorkerId: DEMO_PURCHASE_WORKER_ID, materialAttachmentId: attachmentId,
            materialFileName: fileName, materialMimeType: mimeType, materialFileSize: buffer.length, workflowInstanceId: null,
          }))
        },
      })
      agencyCase = await loadCase()
    }
    if (!agencyCase || agencyCase.customerEntityId !== identity.customerEntityId || agencyCase.submittedByCustomerUserId !== identity.customerUserId
      || agencyCase.agentWorkerId !== DEMO_PURCHASE_WORKER_ID || agencyCase.materialFileName !== fileName
      || agencyCase.materialMimeType !== mimeType || agencyCase.materialFileSize !== buffer.length) conflict()
    const correlationKey = `agency-demo-purchase:${caseId}`
    const binding = { caseId, customerEntityId: identity.customerEntityId, submittedByCustomerUserId: identity.customerUserId, orderId, paymentId, materialHash }
    let workflow = await findOneWithDecryption(em, WorkflowInstance, {
      ...scope, workflowId: DEMO_PURCHASE_WORKFLOW_ID, correlationKey, deletedAt: null,
      ...(agencyCase.workflowInstanceId ? { id: agencyCase.workflowInstanceId } : {}),
    }, undefined, scope)
    if (agencyCase.workflowInstanceId && !workflow) conflict()
    const executor = container.resolve<Executor>('workflowExecutor')
    if (workflow) {
      if (!Object.entries(binding).every(([key, value]) => workflow!.context[key] === value)
        || workflow.metadata?.entityType !== 'agency_operations:agency_case' || workflow.metadata.entityId !== caseId) conflict()
    } else {
      workflow = await executor.startWorkflow(em, {
        ...scope, workflowId: DEMO_PURCHASE_WORKFLOW_ID, version: definition.version, correlationKey,
        initialContext: { ...binding, demoOnly: true, materialAttachmentId: agencyCase.materialAttachmentId },
        metadata: { entityType: 'agency_operations:agency_case', entityId: caseId, labels: { agentWorkerId: DEMO_PURCHASE_WORKER_ID } },
      })
    }
    if (agencyCase.workflowInstanceId !== workflow.id) {
      agencyCase.workflowInstanceId = workflow.id
      agencyCase.updatedAt = new Date()
      await em.flush()
    }
    if (workflow.status === 'RUNNING' && workflow.currentStepId !== 'awaiting_execution') {
      const result = await executor.executeWorkflow(em, container, workflow.id)
      if (!['RUNNING', 'PAUSED'].includes(result.status) || result.currentStep !== 'awaiting_execution') conflict()
    } else if (!['RUNNING', 'PAUSED'].includes(workflow.status) || workflow.currentStepId !== 'awaiting_execution') conflict()
    return { caseId, workflowInstanceId: workflow.id }
  }
}

type AnalysisActivationArgs = {
  container: AppContainer
  em: EntityManager
  scope: { tenantId: string; organizationId: string }
  launch: AnalysisLaunch
  input: z.infer<typeof activationSchema>
}

/**
 * Paid purchase → analysis case. The case and its workflow instance are created
 * inside the purchase transaction (a failed payment never leaves a case behind);
 * the workflow is only executed — which enqueues the async, paid research step —
 * through the returned `launch` after the commit, so the worker sees every row.
 */
async function activateAnalysis({ container, em, scope, launch, input }: AnalysisActivationArgs) {
  const { identity, caseId, orderId, paymentId, originalPurchase, termsAcceptedAt } = input
  const material = buildAnalysisMaterial(originalPurchase, launch.policy, { orderId, termsAcceptedAt })
  const buffer = Buffer.from(JSON.stringify(material, null, 2), 'utf8')
  const materialHash = createHash('sha256').update(buffer).digest('hex')
  const fileName = `analysis-order-${materialHash}.json`
  const mimeType = 'application/json'
  const loadCase = () => findOneWithDecryption(em, AgencyCase, { ...scope, id: caseId, deletedAt: null }, undefined, scope)
  let agencyCase = await loadCase()
  if (!agencyCase) {
    await container.resolve<AttachmentService>('attachmentService').createScoped({
      ...scope, entityId: AGENCY_CASE_ATTACHMENT_ENTITY_ID, recordId: caseId,
      partitionCode: AGENCY_CASE_ATTACHMENT_PARTITION_CODE, fileName, declaredMimeType: mimeType, buffer,
      assignments: [{ type: AGENCY_CASE_ATTACHMENT_ENTITY_ID, id: caseId }],
      persistLink: (tx, attachmentId) => {
        tx.persist(tx.create(AgencyCase, {
          ...scope, id: caseId, customerEntityId: identity.customerEntityId, submittedByCustomerUserId: identity.customerUserId,
          title: `${demoOffer.name}: ${originalPurchase.buyer.brandDisplayName}`,
          agentWorkerId: AGENCY_ANALYSIS_WORKER_ID, materialAttachmentId: attachmentId,
          materialFileName: fileName, materialMimeType: mimeType, materialFileSize: buffer.length, workflowInstanceId: null,
        }))
      },
    })
    agencyCase = await loadCase()
  }
  if (!agencyCase || agencyCase.customerEntityId !== identity.customerEntityId || agencyCase.submittedByCustomerUserId !== identity.customerUserId
    || agencyCase.agentWorkerId !== AGENCY_ANALYSIS_WORKER_ID || agencyCase.materialFileName !== fileName
    || agencyCase.materialMimeType !== mimeType || agencyCase.materialFileSize !== buffer.length) conflict()
  const correlationKey = `agency-case:${caseId}`
  let workflow = await findOneWithDecryption(em, WorkflowInstance, {
    ...scope, workflowId: launch.workflowId, correlationKey, deletedAt: null,
    ...(agencyCase.workflowInstanceId ? { id: agencyCase.workflowInstanceId } : {}),
  }, undefined, scope)
  if (agencyCase.workflowInstanceId && !workflow) conflict()
  const executor = container.resolve<Executor>('workflowExecutor')
  if (workflow) {
    if (workflow.metadata?.entityType !== 'agency_operations:agency_case' || workflow.metadata.entityId !== caseId) conflict()
  } else {
    workflow = await executor.startWorkflow(em, {
      ...scope, workflowId: launch.workflowId, version: launch.version, correlationKey,
      initialContext: {
        caseId, tenantId: scope.tenantId, organizationId: scope.organizationId,
        customerEntityId: identity.customerEntityId, submittedByCustomerUserId: identity.customerUserId,
        title: agencyCase.title, agentWorkerId: AGENCY_ANALYSIS_WORKER_ID,
        materialFileName: fileName, materialMimeType: mimeType, materialFileSize: buffer.length,
        purchase: { orderId, paymentId, demoOnly: true, materialHash },
      },
      metadata: { entityType: 'agency_operations:agency_case', entityId: caseId, labels: { agentWorkerId: AGENCY_ANALYSIS_WORKER_ID } },
    })
  }
  if (agencyCase.workflowInstanceId !== workflow.id) {
    agencyCase.workflowInstanceId = workflow.id
    agencyCase.updatedAt = new Date()
    await em.flush()
  }
  const workflowInstanceId = workflow.id
  const notYetExecuted = workflow.status === 'RUNNING' && workflow.currentStepId === 'start'
  return {
    caseId,
    workflowInstanceId,
    ...(notYetExecuted ? { launch: async () => { await executor.executeWorkflow(container.resolve<EntityManager>('em'), container, workflowInstanceId) } } : {}),
  }
}
