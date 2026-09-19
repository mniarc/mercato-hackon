'use client'

import Link from 'next/link'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'

/** Navigation only: projections/APIs, never a URL, authorize case access. */
export function AgencyJourneyLinks({ orgSlug, caseId, showOffer = false }: {
  orgSlug: string; caseId?: string | null; showOffer?: boolean
}) {
  const t = useT()
  const portal = `/${encodeURIComponent(orgSlug)}/portal`
  return <nav className="flex flex-wrap gap-2" aria-label={t('agency.journey.navigation')}>
    {showOffer ? <Button type="button" asChild variant="outline"><Link href={`${portal}/agency`}>{t('agency.offer.label')}</Link></Button> : null}
    <Button type="button" asChild variant="outline"><Link href={caseId ? `${portal}/agency/cases/${encodeURIComponent(caseId)}` : `${portal}/agency/cases`}>
      {t(caseId ? 'agency.cases.open' : 'agency.cases.title')}
    </Link></Button>
    <Button type="button" asChild variant="outline"><Link href={`${portal}/tasks`}>{t('agency.cases.openTasks')}</Link></Button>
    {caseId ? <Button type="button" asChild variant="outline"><Link href={`${portal}/agency/materials?caseId=${encodeURIComponent(caseId)}`}>{t('agency.materials.link')}</Link></Button> : null}
  </nav>
}
