'use client'

import * as React from 'react'
import type { InjectionSpotId } from '@open-mercato/shared/modules/widgets/injection'
import {
  loadInjectionWidgetsForSpot,
  subscribeToInjectionRegistryChanges,
  getInjectionRegistryVersion,
  type LoadedInjectionWidget,
} from '@open-mercato/shared/modules/widgets/injection-loader'
import { hasAllFeatures } from '@open-mercato/shared/security/features'
import { apiCall } from '../../backend/utils/apiCall'
import { createLogger } from '@open-mercato/shared/lib/logger'

const logger = createLogger('ui').child({ component: 'usePortalDashboardWidgets' })

type PortalFeatureCheckResponse = {
  ok: boolean
  granted?: string[]
}

function collectRequiredFeatures(widgets: LoadedInjectionWidget[]): string[] {
  const set = new Set<string>()
  for (const widget of widgets) {
    for (const feature of widget.metadata.features ?? []) {
      if (!feature || feature.trim().length === 0) continue
      set.add(feature)
    }
  }
  return Array.from(set)
}

async function readPortalGrantedFeatures(features: string[]): Promise<Set<string>> {
  if (features.length === 0) return new Set()
  try {
    const { ok, result: data } = await apiCall<PortalFeatureCheckResponse>('/api/customer_accounts/portal/feature-check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ features }),
    })
    if (!ok || !data?.ok) return new Set()
    return new Set(data.granted ?? [])
  } catch {
    return new Set()
  }
}

/**
 * Loads UI injection widgets (with Widget component) for a portal spot.
 *
 * Unlike `useInjectionDataWidgets` which loads data-only widgets (columns, fields, menuItems),
 * this hook loads widgets that export a `Widget` React component — suitable for
 * portal dashboard sections and other UI injection spots.
 *
 * Feature gating: widgets declaring `metadata.features` are filtered against the
 * authenticated customer's grants resolved via
 * `/api/customer_accounts/portal/feature-check`. Wildcard grants (`portal.*`) resolve
 * through the shared matcher.
 */
export function usePortalDashboardWidgets(spotId: InjectionSpotId): {
  widgets: LoadedInjectionWidget[]
  isLoading: boolean
  error: string | null
} {
  const [widgets, setWidgets] = React.useState<LoadedInjectionWidget[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [grantedFeatures, setGrantedFeatures] = React.useState<Set<string>>(new Set())
  // Re-load whenever the injection registry version changes. On a fresh page
  // load the ClientBootstrap can register widgets AFTER this hook's first effect
  // has already read an empty table; subscribing here lets the dashboard pick
  // them up instead of showing the empty state permanently (#race).
  const [registryVersion, setRegistryVersion] = React.useState(() => getInjectionRegistryVersion())

  React.useEffect(() => {
    const unsubscribe = subscribeToInjectionRegistryChanges(() => {
      setRegistryVersion(getInjectionRegistryVersion())
    })
    // Sync once in case the version advanced between the initial state read and
    // the subscription being attached.
    setRegistryVersion(getInjectionRegistryVersion())
    return unsubscribe
  }, [])

  React.useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const loaded = await loadInjectionWidgetsForSpot(spotId)
        if (!mounted) return
        // Only keep widgets that have a Widget component
        const uiWidgets = loaded.filter((w) => typeof w.Widget === 'function')
        setWidgets(uiWidgets)
        const required = collectRequiredFeatures(uiWidgets)
        const granted = await readPortalGrantedFeatures(required)
        if (!mounted) return
        setGrantedFeatures(granted)
      } catch (loadError) {
        if (!mounted) return
        logger.error('Failed to load widgets for spot', { spotId, err: loadError })
        setError(loadError instanceof Error ? loadError.message : String(loadError))
        setWidgets([])
      } finally {
        if (mounted) setIsLoading(false)
      }
    }
    void load()
    return () => {
      mounted = false
    }
  }, [spotId, registryVersion])

  const grantedFeatureList = React.useMemo(() => Array.from(grantedFeatures), [grantedFeatures])

  const visibleWidgets = React.useMemo(
    () =>
      widgets.filter((widget) => {
        const required = widget.metadata.features ?? []
        return required.length === 0 || hasAllFeatures(grantedFeatureList, required)
      }),
    [widgets, grantedFeatureList],
  )

  return { widgets: visibleWidgets, isLoading, error }
}
