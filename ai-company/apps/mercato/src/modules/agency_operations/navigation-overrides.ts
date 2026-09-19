import type { InjectionWidgetOverridesMap, PageRouteOverridesMap } from '@open-mercato/shared/modules/overrides'

export const agencySampleMenuOverrides: InjectionWidgetOverridesMap = {
  'example.injection.example-menus': null,
  'example.injection.example-profile-menu': null,
}

export const agencySamplePageOverrides: PageRouteOverridesMap = Object.fromEntries([
  '/backend/example',
  '/backend/payments',
  '/backend/products',
  '/backend/component-overrides',
  '/backend/mutation-lifecycle',
  '/backend/umes-extensions',
  '/backend/umes-handlers',
  '/backend/umes-integrations',
  '/backend/umes-next-phases',
  '/backend/umes-query-extensions',
  '/backend/todos',
  '/backend/todos/create',
  '/backend/todos/[id]/edit',
].map((path) => [path, { metadata: { navHidden: true } }]))
