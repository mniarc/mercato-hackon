import path from 'node:path'
import { bootstrapFromAppRoot } from '@open-mercato/shared/lib/bootstrap/dynamicLoader'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { configureDemoPurchase } from '../../../lib/orderBootstrap/configure'
import { configureDemoPurchaseWorkflow } from '../../../lib/orderBootstrap/workflow'
import type { CredentialsService } from '@open-mercato/core/modules/integrations/lib/credentials-service'
import { computeMockWebhookSignature, MOCK_GATEWAY_DEV_WEBHOOK_SECRET, MOCK_GATEWAY_SIGNATURE_HEADER } from '../../../../example/lib/mock-gateway-adapter'

export async function configurePurchaseJourney(input: { tenantId: string; organizationId: string; userId: string }): Promise<void> {
  const appRoot = path.resolve(process.env.OM_TEST_APP_ROOT ?? path.resolve(process.cwd(), 'apps/mercato'))
  await bootstrapFromAppRoot(appRoot)
  const container = await createRequestContainer()
  try {
    // Same explicit native setup as the CLI. Existing scoped configuration is reused,
    // not overwritten; the demo catalog/definition remains available for manual use.
    await configureDemoPurchase(container, input)
    await configureDemoPurchaseWorkflow(container, input)
  } finally {
    await container.dispose()
  }
}

/** Sign a test-provider failure; the public webhook verifies and persists it normally. */
export async function failedPaymentWebhook(input: { tenantId: string; organizationId: string; providerSessionId: string }) {
  const container = await createRequestContainer()
  try {
    const credentials = await container.resolve<CredentialsService>('integrationCredentialsService')
      .resolve('gateway_mock_processing', { tenantId: input.tenantId, organizationId: input.organizationId }) ?? {}
    const configuredSecret = typeof credentials.webhookSecret === 'string' ? credentials.webhookSecret.trim() : ''
    const secret = configuredSecret || process.env.MOCK_GATEWAY_WEBHOOK_SECRET?.trim() || MOCK_GATEWAY_DEV_WEBHOOK_SECRET
    const body = JSON.stringify({ id: `agency-demo-failure:${input.providerSessionId}`, type: 'payment.failed',
      data: { id: input.providerSessionId, status: 'failed', amount: 2500, currency: 'PLN' } })
    return { body, headers: { [MOCK_GATEWAY_SIGNATURE_HEADER]: computeMockWebhookSignature(body, secret) } }
  } finally {
    await container.dispose()
  }
}
