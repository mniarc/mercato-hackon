import type { APIRequestContext } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { deleteAttachmentIfExists } from '@open-mercato/core/helpers/integration/attachmentsFixtures'
import { deleteSalesEntityIfExists } from '@open-mercato/core/helpers/integration/salesFixtures'

export type PurchaseFixtureScope = { tenantId: string; organizationId: string; customerEntityId: string; customerUserId: string }

export async function readOnboardedPurchaseCompanies(input: { tenantId: string; organizationId: string; customerUserId: string }): Promise<string[]> {
  return withClient(async (client) => {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM customer_entities WHERE tenant_id=$1 AND organization_id=$2
       AND kind='company' AND source=$3 AND deleted_at IS NULL`,
      [input.tenantId, input.organizationId, `agency_onboarding:${input.customerUserId}`])
    return result.rows.map((row) => row.id)
  })
}

export async function readPurchaseJourneyRecords(scope: PurchaseFixtureScope) {
  return withClient(async (client) => {
    const params = [scope.tenantId, scope.organizationId, scope.customerEntityId, scope.customerUserId]
    // This customer is created exclusively by the journey. Native sales metadata
    // is encrypted, so raw SQL must not predicate on its JSON contents.
    const purchaseParams = params.slice(0, 3)
    const orders = await client.query<{ id: string; currency_code: string; grand_total_gross_amount: string; metadata: Record<string, unknown> }>(
      `SELECT id,currency_code,grand_total_gross_amount,metadata FROM sales_orders
       WHERE tenant_id=$1 AND organization_id=$2 AND customer_entity_id=$3
       AND deleted_at IS NULL`, purchaseParams)
    const quotes = await client.query<{ id: string }>(
      `SELECT id FROM sales_quotes WHERE tenant_id=$1 AND organization_id=$2 AND customer_entity_id=$3
       AND deleted_at IS NULL`, purchaseParams)
    const cases = await client.query<{ id: string; material_attachment_id: string; material_mime_type: string; workflow_instance_id: string;
      workflow_status: string; current_step_id: string; workflow_id: string }>(
      `SELECT c.id,c.material_attachment_id,c.material_mime_type,c.workflow_instance_id,
       w.status AS workflow_status,w.current_step_id,w.workflow_id FROM agency_cases c
       LEFT JOIN workflow_instances w ON w.id=c.workflow_instance_id AND w.tenant_id=c.tenant_id AND w.organization_id=c.organization_id
       WHERE c.tenant_id=$1 AND c.organization_id=$2 AND c.customer_entity_id=$3
       AND c.submitted_by_customer_user_id=$4 AND c.deleted_at IS NULL`, params)
    const payments = await client.query<{ id: string; order_id: string; amount: string; captured_amount: string; currency_code: string }>(
      `SELECT p.id,p.order_id,p.amount,p.captured_amount,p.currency_code FROM sales_payments p
       JOIN sales_orders o ON o.id=p.order_id AND o.tenant_id=p.tenant_id AND o.organization_id=p.organization_id
       WHERE o.tenant_id=$1 AND o.organization_id=$2 AND o.customer_entity_id=$3
       AND p.deleted_at IS NULL`, purchaseParams)
    const attempts = await client.query<{ id: string; payment_id: string; provider_session_id: string;
      provider_key: string; unified_status: string; captured_amount: string | null }>(
      `SELECT g.id,g.payment_id,g.provider_session_id,g.provider_key,g.unified_status,g.captured_amount
       FROM gateway_transactions g
       JOIN sales_payments p ON p.id=g.payment_id AND p.tenant_id=g.tenant_id AND p.organization_id=g.organization_id
       JOIN sales_orders o ON o.id=p.order_id AND o.tenant_id=p.tenant_id AND o.organization_id=p.organization_id
       WHERE o.tenant_id=$1 AND o.organization_id=$2 AND o.customer_entity_id=$3
       AND g.deleted_at IS NULL`, purchaseParams)
    return { orders: orders.rows, quotes: quotes.rows, cases: cases.rows, payments: payments.rows, attempts: attempts.rows }
  })
}

export async function deletePurchaseJourneyRecords(request: APIRequestContext, adminToken: string, scope: PurchaseFixtureScope): Promise<void> {
  // Discover only this freshly created customer's purchase rows, also after an interrupted POST.
  const records = await readPurchaseJourneyRecords(scope)
  for (const item of records.cases) await deleteAttachmentIfExists(request, adminToken, item.material_attachment_id)
  await withClient(async (client) => {
    for (const item of records.cases) {
      const params = [item.workflow_instance_id, scope.tenantId, scope.organizationId]
      for (const table of ['workflow_events', 'user_tasks', 'step_instances', 'workflow_branch_instances']) {
        await client.query(`DELETE FROM ${table} WHERE workflow_instance_id=$1 AND tenant_id=$2 AND organization_id=$3`, params)
      }
      await client.query('DELETE FROM workflow_instances WHERE id=$1 AND tenant_id=$2 AND organization_id=$3', params)
      await client.query('DELETE FROM agency_cases WHERE id=$1 AND tenant_id=$2 AND organization_id=$3 AND customer_entity_id=$4',
        [item.id, scope.tenantId, scope.organizationId, scope.customerEntityId])
    }
    for (const attempt of records.attempts) {
      const params = [attempt.id, scope.tenantId, scope.organizationId]
      await client.query('DELETE FROM gateway_session_initializations WHERE gateway_transaction_id=$1 AND tenant_id=$2 AND organization_id=$3', params)
      await client.query('DELETE FROM gateway_payment_operations WHERE transaction_id=$1 AND tenant_id=$2 AND organization_id=$3', params)
      await client.query('DELETE FROM gateway_webhook_events WHERE idempotency_key=ANY($1::text[]) AND tenant_id=$2 AND organization_id=$3 AND provider_key=$4',
        [[`agency-demo-capture:${attempt.id}`, `agency-demo-failure:${attempt.provider_session_id}`], scope.tenantId, scope.organizationId, 'mock_processing'])
      await client.query('DELETE FROM gateway_transactions WHERE id=$1 AND tenant_id=$2 AND organization_id=$3', params)
    }
  })
  for (const item of records.payments) await deleteSalesEntityIfExists(request, adminToken, '/api/sales/payments', item.id)
  for (const item of records.orders) await deleteSalesEntityIfExists(request, adminToken, '/api/sales/orders', item.id)
  for (const item of records.quotes) await deleteSalesEntityIfExists(request, adminToken, '/api/sales/quotes', item.id)
}
