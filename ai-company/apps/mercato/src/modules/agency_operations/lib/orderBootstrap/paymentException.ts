import type { EntityManager } from '@mikro-orm/postgresql'
import { WorkflowInstance, type WorkflowDefinitionData } from '@open-mercato/core/modules/workflows/data/entities'
import type { WorkflowDefinitionAuthoring } from '@open-mercato/core/modules/workflows/lib/owned-definition'
import type * as WorkflowExecutor from '@open-mercato/core/modules/workflows/lib/workflow-executor'
import type { SalesOrder, SalesPayment } from '@open-mercato/core/modules/sales/data/entities'
import type { GatewayTransaction } from '@open-mercato/core/modules/payment_gateways/data/entities'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { demoOffer } from './demoOffer'
import { matchesDemoPayment } from './payment'

export const PAYMENT_EXCEPTION_WORKFLOW_ID = 'agency_operations.payment-exception.v1'
const ownerId = 'payment_exception'

export const paymentExceptionWorkflow: WorkflowDefinitionData = {
  steps: [
    { stepId: 'start', stepName: 'Payment discrepancy recorded', stepType: 'START' },
    { stepId: 'payment_exception', stepName: 'E.1 Payment exception / Wyjątek płatności', stepType: 'USER_TASK', userTaskConfig: {
      assignedToRoles: ['employee'], priority: 'high',
      instructions: {
        en: 'Payment verification is blocked. Investigate the native order, payment and gateway transaction below. Recording a hold does not confirm payment, activate fulfilment, issue an invoice or refund money.\n{{context.evidenceText}}',
        pl: 'Weryfikacja płatności jest zablokowana. Sprawdź zamówienie, płatność i transakcję operatora poniżej. Zapis pozostawienia blokady nie potwierdza płatności, nie uruchamia realizacji, nie wystawia faktury ani nie zwraca środków.\n{{context.evidenceText}}',
      },
      entityBindings: [{ entityType: 'sales:sales_order', idPath: '{{context.orderId}}' }],
      formSchema: { fields: [{ name: 'paymentExceptionHoldReason', type: 'textarea', label: 'Reason for continued hold / Powód pozostawienia blokady', required: true }] },
      decisions: [{ id: 'keep_blocked', label: { en: 'Record continued hold', pl: 'Zapisz pozostawienie blokady' }, transitionId: 'keep_blocked', style: 'secondary' }],
    } },
    { stepId: 'waiting', stepName: 'Payment remains blocked', stepType: 'WAIT_FOR_SIGNAL', signalConfig: { signalName: 'agency.payment-exception.follow-up' } },
  ],
  transitions: [
    { transitionId: 'review', fromStepId: 'start', toStepId: 'payment_exception', trigger: 'auto' },
    { transitionId: 'keep_blocked', fromStepId: 'payment_exception', toStepId: 'waiting', trigger: 'manual' },
  ],
}

export function paymentDiscrepancy(order: SalesOrder, payment: SalesPayment, transaction: GatewayTransaction): string | null {
  if (!matchesDemoPayment(order, payment, transaction)) return 'payment_purchase_mismatch'
  if (transaction.unifiedStatus === 'captured' && Number(transaction.capturedAmount) !== demoOffer.amount) return 'capture_amount_mismatch'
  return null
}

/** Reserve under the purchase's customer lock; execute only after that transaction commits. */
export async function preparePaymentException(container: AppContainer, em: EntityManager,
  order: SalesOrder, payment: SalesPayment, transaction: GatewayTransaction): Promise<(() => Promise<void>) | null> {
  const reason = paymentDiscrepancy(order, payment, transaction)
  if (!reason) return null
  const scope = { tenantId: order.tenantId, organizationId: order.organizationId }
  if ([payment, transaction].some((row) => row.tenantId !== scope.tenantId || row.organizationId !== scope.organizationId)) {
    throw new CrudHttpError(409, { error: 'api.errors.conflict' })
  }
  const executor = container.resolve<typeof WorkflowExecutor>('workflowExecutor')
  const correlationKey = `agency-payment-exception:${order.id}:${transaction.id}`
  let workflow = await findOneWithDecryption(em, WorkflowInstance, {
    ...scope, workflowId: PAYMENT_EXCEPTION_WORKFLOW_ID, correlationKey, deletedAt: null,
  }, undefined, scope)
  if (!workflow) {
    const authoring = container.resolve<WorkflowDefinitionAuthoring>('workflowDefinitionAuthoring')
    let definition = await authoring.findOwnedDefinition(em, { ...scope, workflowId: PAYMENT_EXCEPTION_WORKFLOW_ID })
    if (!definition) {
      const result = await authoring.upsertOwnedDefinition(em, {
        ...scope, workflowId: PAYMENT_EXCEPTION_WORKFLOW_ID, ownerModule: 'agency_operations', ownerId,
        workflowName: 'E.1 Payment exception', definition: paymentExceptionWorkflow, grantedFeatures: [],
      })
      if (!result.ok) throw new CrudHttpError(409, { error: 'api.errors.conflict' })
      definition = result.definition
    }
    if (!definition.enabled || definition.metadata?.generatedBy?.module !== 'agency_operations' || definition.metadata.generatedBy.ownerId !== ownerId) {
      throw new CrudHttpError(409, { error: 'api.errors.conflict' })
    }
    const evidence = {
      reason, orderId: order.id, paymentId: payment.id, transactionId: transaction.id,
      expected: { amount: demoOffer.amount, currency: demoOffer.currency, provider: demoOffer.provider },
      order: { amount: order.grandTotalGrossAmount, currency: order.currencyCode },
      payment: { orderId: payment.order?.id ?? null, amount: payment.amount, currency: payment.currencyCode,
        capturedAmount: payment.capturedAmount, refundedAmount: payment.refundedAmount },
      transaction: { paymentId: transaction.paymentId, provider: transaction.providerKey, amount: transaction.amount,
        currency: transaction.currencyCode, status: transaction.unifiedStatus, capturedAmount: transaction.capturedAmount },
    }
    workflow = await executor.startWorkflow(em, {
      ...scope, workflowId: definition.workflowId, version: definition.version, correlationKey,
      metadata: { entityType: 'sales:sales_order', entityId: order.id },
      initialContext: { ...scope, orderId: order.id, paymentId: payment.id, transactionId: transaction.id,
        evidence, evidenceText: JSON.stringify(evidence, null, 2) },
    })
  }
  const id = workflow.id
  return workflow.status === 'RUNNING' && workflow.currentStepId === 'start'
    ? async () => { await executor.executeWorkflow(container.resolve<EntityManager>('em'), container, id) }
    : null
}
