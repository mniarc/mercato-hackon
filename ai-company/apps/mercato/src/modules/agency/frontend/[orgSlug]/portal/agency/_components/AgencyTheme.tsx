"use client"

import { AGENCY_FONT_STYLESHEET_URL } from '../../../../../theme/fonts'
import type { ReactNode } from 'react'
import { THEME_CSS } from '../../../../../theme/portalStyles'

/**
 * Studio Komunikacji portal skin: wide thin Archivo typography, glass cards,
 * violet primary and a violet price card — applied via scoped DS token overrides
 * so every portal page adopts the look without rewriting each component.
 */
export function AgencyTheme({ children }: { children: ReactNode }) {
  return (
    <div className="agency-portal">
      <link rel="stylesheet" href={AGENCY_FONT_STYLESHEET_URL} />
      <style>{THEME_CSS}</style>
      {children}
    </div>
  )
}
