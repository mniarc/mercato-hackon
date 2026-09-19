import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { compileAppSourceFile } from '@open-mercato/shared/lib/bootstrap/dynamicLoader'
import type { PlanReviewFixture } from './planReview.backend'

export type { PlanReviewFixture } from './planReview.backend'
type Backend = typeof import('./planReview.backend')
let backend: Promise<Backend> | undefined

function loadBackend(): Promise<Backend> {
  return backend ??= (async () => {
    const appRoot = path.resolve(process.env.OM_TEST_APP_ROOT ?? path.resolve(process.cwd(), 'apps/mercato'))
    const source = path.join(appRoot, 'src/modules/agency_operations/__integration__/support/planReview.backend.ts')
    const output = await compileAppSourceFile(source, {
      appRoot, outFile: path.join(appRoot, '.mercato/agency-dev/plan-review-fixture.mjs'), format: 'esm',
    })
    return import(pathToFileURL(output).href) as Promise<Backend>
  })()
}

export async function createPlanReviewFixture(input: Parameters<Backend['createPlanReviewFixture']>[0]): Promise<PlanReviewFixture> {
  return (await loadBackend()).createPlanReviewFixture(input)
}

export async function deletePlanReviewFixture(fixture: PlanReviewFixture): Promise<void> {
  return (await loadBackend()).deletePlanReviewFixture(fixture)
}
