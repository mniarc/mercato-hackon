import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { compileAppSourceFile } from '@open-mercato/shared/lib/bootstrap/dynamicLoader'
type Backend = typeof import('./setup.backend')
let loaded: Promise<Backend> | undefined
function backend() {
  return loaded ??= (async () => {
    const appRoot = path.resolve(process.env.OM_TEST_APP_ROOT ?? path.resolve(process.cwd(), 'apps/mercato'))
    const output = await compileAppSourceFile(path.join(appRoot, 'src/modules/agency_operations/__integration__/support/productionJourney/setup.backend.ts'), {
      appRoot, outFile: path.join(appRoot, '.mercato/agency-dev/production-journey-setup.mjs'), format: 'esm',
    })
    return import(pathToFileURL(output).href) as Promise<Backend>
  })()
}
export async function configureProductionJourney(input: Parameters<Backend['configureProductionJourney']>[0]) {
  return (await backend()).configureProductionJourney(input)
}
export async function configureCurrentTriageJourney(input: Parameters<Backend['configureCurrentTriageJourney']>[0]) {
  return (await backend()).configureCurrentTriageJourney(input)
}
export async function configureFullProductionJourney(input: Omit<Parameters<Backend['configureProductionJourney']>[0], 'includePost'>) {
  return (await backend()).configureProductionJourney({ ...input, includePost: true })
}
export async function readProducedBrief(...input: Parameters<Backend['readProducedBrief']>) {
  return (await backend()).readProducedBrief(...input)
}
export async function readSpecialistForCase(input: Parameters<Backend['readSpecialistForCase']>[0]) {
  return (await backend()).readSpecialistForCase(input)
}
export async function removeProductionJourneyDefinition(input: Parameters<Backend['removeProductionJourneyDefinition']>[0]) {
  return (await backend()).removeProductionJourneyDefinition(input)
}
