/** @jest-environment node */
import { applyPageOverridesToManifests } from '@open-mercato/shared/modules/overrides'
import type { FrontendRouteManifestEntry } from '@open-mercato/shared/modules/registry'
import { agencyPortalTaskRoutes } from '../route-overrides'
import AgencyTaskPage from '../components/AgencyTaskPage'
import AgencyTasksPage from '../components/AgencyTasksPage'
import { enabledModules } from '../../../modules'
import path from 'node:path'
import { createCliBundlePlugins } from '@open-mercato/shared/lib/bootstrap/dynamicLoader'

jest.mock('../components/AgencyTaskPage', () => ({ __esModule: true, default: function AgencyTaskPage() { return null } }))
jest.mock('../components/AgencyTasksPage', () => ({ __esModule: true, default: function AgencyTasksPage() { return null } }))

test('replaces native task loaders while retaining their customer guards and task navigation', async () => {
  expect(enabledModules.find((entry) => entry.id === 'agency')?.overrides?.routes?.pages).toBe(agencyPortalTaskRoutes)
  const nativeTask = () => null
  const routes: FrontendRouteManifestEntry[] = ['/tasks', '/tasks/[id]', '/profile'].map((suffix) => ({
    moduleId: 'workflows', path: `/[orgSlug]/portal${suffix}`, pattern: `/[orgSlug]/portal${suffix}`,
    requireCustomerAuth: true, requireCustomerFeatures: ['portal.tasks.view'],
    nav: { label: 'Tasks', group: 'main', order: 40 },
    load: async () => nativeTask,
  }))
  const replaced = applyPageOverridesToManifests(routes, agencyPortalTaskRoutes, 'frontend')
  expect(await replaced[0].load()).toBe(AgencyTasksPage)
  expect(await replaced[1].load()).toBe(AgencyTaskPage)
  expect(await replaced[2].load()).toBe(nativeTask)
  for (const [index, route] of replaced.entries()) {
    expect(route.requireCustomerAuth).toBe(routes[index].requireCustomerAuth)
    expect(route.requireCustomerFeatures).toEqual(routes[index].requireCustomerFeatures)
    expect(route.nav).toEqual(routes[index].nav)
  }
})

test('keeps real page loaders in Next while native CLI compilation excludes their browser import graph', async () => {
  const esbuild = await import('esbuild')
  const result = await esbuild.build({
    entryPoints: [path.resolve(__dirname, '../route-overrides.ts')],
    bundle: true, format: 'esm', platform: 'node', write: false,
    plugins: createCliBundlePlugins(path.resolve(__dirname, '../../../..')),
  })
  expect(result.outputFiles[0].text).toContain('clientOnlyModuleUnavailable')
  expect(result.outputFiles[0].text).not.toContain('next/link')
  expect(result.outputFiles[0].text).not.toContain('next/dynamic')
})
