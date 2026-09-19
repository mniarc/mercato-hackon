import path from 'node:path'
import { bootstrapFromAppRoot } from '@open-mercato/shared/lib/bootstrap/dynamicLoader'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { configureDemoPurchase } from '../../../lib/orderBootstrap/configure'
import { configureDemoPurchaseWorkflow } from '../../../lib/orderBootstrap/workflow'

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
