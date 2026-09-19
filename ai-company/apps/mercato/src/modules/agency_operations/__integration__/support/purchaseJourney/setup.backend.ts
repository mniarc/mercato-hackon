import path from 'node:path'
import { bootstrapFromAppRoot } from '@open-mercato/shared/lib/bootstrap/dynamicLoader'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { configureDemoPurchase } from '../../../lib/orderBootstrap/configure'
import { configureDemoPurchaseWorkflow } from '../../../lib/orderBootstrap/workflow'
import type { CredentialsService } from '@open-mercato/core/modules/integrations/lib/credentials-service'
import { computeMockWebhookSignature, MOCK_GATEWAY_DEV_WEBHOOK_SECRET, MOCK_GATEWAY_SIGNATURE_HEADER } from '../../../../example/lib/mock-gateway-adapter'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { WorkflowDefinitionAuthoring } from '@open-mercato/core/modules/workflows/lib/owned-definition'
import { parseBooleanWithDefault } from '@open-mercato/shared/lib/boolean'
import { analysisExecutionPolicySchema } from '../../../lib/analysisProcess/contracts'
import { AGENCY_ANALYSIS_FUNCTION_NAME, AGENCY_ANALYSIS_WORKFLOW_ID } from '../../../lib/analysisProcess/workflow'
import { demoOffer } from '../../../lib/orderBootstrap/demoOffer'

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

/** TC001 covers handoffs, not the research provider protocol owned by TC002. */
export async function assertNoMatchingPurchaseAnalysis(scope: { tenantId: string; organizationId: string }): Promise<void> {
  if (!parseBooleanWithDefault(process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED, false)) return
  const container = await createRequestContainer()
  try {
    const definition = await container.resolve<WorkflowDefinitionAuthoring>('workflowDefinitionAuthoring')
      .findOwnedDefinition(container.resolve<EntityManager>('em'), { ...scope, workflowId: AGENCY_ANALYSIS_WORKFLOW_ID })
    if (!definition?.enabled || definition.metadata?.generatedBy?.module !== 'agency_operations'
      || definition.metadata.generatedBy.ownerId !== 'analysis') return
    const activities = definition.definition.transitions.flatMap((transition) => transition.activities ?? [])
      .filter((activity) => activity.activityType === 'EXECUTE_FUNCTION' && activity.config.functionName === AGENCY_ANALYSIS_FUNCTION_NAME)
    const policy = activities.length === 1 && activities[0].async === true
      ? analysisExecutionPolicySchema.safeParse(activities[0].config.args?.policy) : null
    if (!policy?.success) return
    const product = policy.data.productSelection
    if (product.sku === demoOffer.sku && product.offer_version === demoOffer.offerVersion
      && product.price_net === demoOffer.amount && product.currency === demoOffer.currency) {
      throw new Error('TC001 requires a purchased case waiting for research configuration. A matching analysis policy is enabled; use TC002 for that connected research scenario. No existing configuration was changed.')
    }
  } finally { await container.dispose() }
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
