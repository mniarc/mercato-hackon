import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { compileAppSourceFile } from '@open-mercato/shared/lib/bootstrap/dynamicLoader'

type Backend = typeof import('./setup.backend')
let backend: Promise<Backend> | undefined

/** Use the app compiler, as the existing plan fixture does, for decorated native entities. */
export async function configurePurchaseJourney(input: Parameters<Backend['configurePurchaseJourney']>[0]): Promise<void> {
  backend ??= (async () => {
    const appRoot = path.resolve(process.env.OM_TEST_APP_ROOT ?? path.resolve(process.cwd(), 'apps/mercato'))
    const output = await compileAppSourceFile(path.join(appRoot, 'src/modules/agency_operations/__integration__/support/purchaseJourney/setup.backend.ts'), {
      appRoot, outFile: path.join(appRoot, '.mercato/agency-dev/purchase-journey-setup.mjs'), format: 'esm',
    })
    return import(pathToFileURL(output).href) as Promise<Backend>
  })()
  await (await backend).configurePurchaseJourney(input)
}
