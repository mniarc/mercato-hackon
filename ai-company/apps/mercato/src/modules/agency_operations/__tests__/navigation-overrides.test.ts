import {
  applyInjectionWidgetOverridesToTables,
  applyPageOverridesToManifests,
  type InjectionWidgetOverridesMap,
  type PageRouteOverridesMap,
} from '@open-mercato/shared/modules/overrides'
import type { BackendRouteManifestEntry } from '@open-mercato/shared/modules/registry'
import { buildAdminNav } from '@open-mercato/ui/backend/utils/nav'
import { enabledModules } from '../../../modules'
import { agencySamplePageOverrides } from '../navigation-overrides'
import { injectionTable } from '../../example/widgets/injection-table'

describe('agency sample navigation overrides', () => {
  it('hides sample entries through native navigation while retaining page access and agency links', async () => {
    const exampleModule = enabledModules.find((entry) => entry.id === 'example')!
    const sampleRoutes: BackendRouteManifestEntry[] = Object.keys(agencySamplePageOverrides).map((path) => ({
      moduleId: 'example',
      path,
      requireAuth: true,
      requireFeatures: ['example.backend'],
      load: async () => () => null,
    }))
    const agencyRoute: BackendRouteManifestEntry = {
      moduleId: 'agency_operations',
      path: '/backend/agency-operations/cases',
      requireAuth: true,
      requireFeatures: ['agency_operations.cases.view'],
      load: async () => () => null,
    }
    const routes = applyPageOverridesToManifests(
      [...sampleRoutes, agencyRoute],
      exampleModule.overrides!.routes!.pages as PageRouteOverridesMap,
      'backend',
    )
    const nav = await buildAdminNav(
      [{ id: 'agency', backendRoutes: routes }],
      { auth: { sub: 'staff' } },
      undefined,
      undefined,
      { checkFeatures: async (features) => features },
    )

    expect(nav.map((entry) => entry.href)).toEqual(['/backend/agency-operations/cases'])
    expect(routes).toEqual([
      ...sampleRoutes.map((route) => ({ ...route, navHidden: true })),
      agencyRoute,
    ])
    expect(exampleModule.from).toBe('@app')
    expect(enabledModules.some((entry) => entry.id === 'payment_gateways')).toBe(true)
  })

  it('removes injected sample shortcuts without disabling unrelated widgets', () => {
    const exampleModule = enabledModules.find((entry) => entry.id === 'example')!
    const [filtered] = applyInjectionWidgetOverridesToTables(
      [{ moduleId: 'example', table: injectionTable }],
      exampleModule.overrides!.widgets!.injection as InjectionWidgetOverridesMap,
    )
    const {
      'menu:sidebar:main': _sidebar,
      'menu:topbar:profile-dropdown': _profile,
      ...remaining
    } = injectionTable

    expect(filtered.table).toEqual(remaining)
  })
})
