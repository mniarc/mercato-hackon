import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { compileAppSourceFile } from '@open-mercato/shared/lib/bootstrap/dynamicLoader'
import type { APIRequestContext } from '@playwright/test'

type Backend = typeof import('./setup.backend')
let backend: Promise<Backend> | undefined

/** Use the app compiler, as the existing plan fixture does, for decorated native entities. */
export async function configurePurchaseJourney(input: Parameters<Backend['configurePurchaseJourney']>[0]): Promise<void> {
  await (await loadBackend()).configurePurchaseJourney(input)
}

export async function assertNoMatchingPurchaseAnalysis(scope: Parameters<Backend['assertNoMatchingPurchaseAnalysis']>[0]): Promise<void> {
  await (await loadBackend()).assertNoMatchingPurchaseAnalysis(scope)
}

async function loadBackend(): Promise<Backend> {
  backend ??= (async () => {
    const appRoot = path.resolve(process.env.OM_TEST_APP_ROOT ?? path.resolve(process.cwd(), 'apps/mercato'))
    const output = await compileAppSourceFile(path.join(appRoot, 'src/modules/agency_operations/__integration__/support/purchaseJourney/setup.backend.ts'), {
      appRoot, outFile: path.join(appRoot, '.mercato/agency-dev/purchase-journey-setup.mjs'), format: 'esm',
    })
    return import(pathToFileURL(output).href) as Promise<Backend>
  })()
  return backend
}

export async function failPurchaseJourneyPayment(request: APIRequestContext, input: Parameters<Backend['failedPaymentWebhook']>[0]) {
  const webhook = await (await loadBackend()).failedPaymentWebhook(input)
  const baseUrl = process.env.BASE_URL?.trim() || 'http://localhost:3000'
  return request.post(new URL('/api/payment_gateways/webhook/mock_processing', baseUrl).toString(), {
    headers: { 'content-type': 'application/json', ...webhook.headers }, data: webhook.body,
  })
}
