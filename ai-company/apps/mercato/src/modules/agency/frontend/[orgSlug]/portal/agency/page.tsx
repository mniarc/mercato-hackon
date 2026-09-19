"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import Link from 'next/link'
import { Button } from '@open-mercato/ui/primitives/button'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { PortalCard, PortalCardHeader } from '@open-mercato/ui/portal/components/PortalCard'
import { AgencyTheme } from './_components/AgencyTheme'
import { OFFER_CSS } from '../../../../theme/offerStyles'

type Props = { params: { orgSlug: string } }

const included: string[] = [
  'agency.offer.included.audit',
  'agency.offer.included.brief',
  'agency.offer.included.strategy',
  'agency.offer.included.tov',
  'agency.offer.included.plan',
  'agency.offer.included.post',
  'agency.offer.included.materials',
]

const boundaries: string[] = [
  'agency.offer.boundaries.scope',
  'agency.offer.boundaries.plan',
  'agency.offer.boundaries.exclusions',
  'agency.offer.boundaries.revisions',
]

export default function AgencyOfferPage({ params }: Props) {
  const t = useT()
  const { orgSlug } = params
  const orderHref = `/${orgSlug}/portal/agency/order`

  const cardPoints = ['Audyt komunikacji i brief', 'Strategia i ton głosu', 'Plan 12 tematów na 30 dni', 'Pierwszy gotowy post', 'Nielimitowane poprawki']
  return (
    <AgencyTheme>
      <style>{OFFER_CSS}</style>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-7">
        <div className="flex flex-wrap gap-2">
          <Button type="button" asChild variant="outline"><Link href={`/${orgSlug}/portal/agency/questions`}>{t('agency.salesQuestions.title')}</Link></Button>
          <Button type="button" asChild variant="outline"><Link href={`/${orgSlug}/portal/agency/cases`}>{t('agency.cases.title')}</Link></Button>
        </div>
        <PortalPageHeader
          label={t('agency.offer.label')}
          title={t('agency.offer.productName')}
          description={t('agency.offer.description')}
        />

        <div className="ag-offer-grid">
          <div className="flex flex-col gap-6">
            <PortalCard>
              <PortalCardHeader title={t('agency.offer.includedTitle')} />
              <ul className="agency-bullets">
                {included.map((item) => (<li key={item}>{t(item)}</li>))}
              </ul>
            </PortalCard>

            <PortalCard>
              <PortalCardHeader title={t('agency.offer.processTitle')} />
              <p className="text-sm text-muted-foreground">{t('agency.offer.process')}</p>
            </PortalCard>

            <PortalCard>
              <PortalCardHeader title={t('agency.offer.boundariesTitle')} />
              <ul className="agency-bullets">
                {boundaries.map((item) => (<li key={item}>{t(item)}</li>))}
              </ul>
            </PortalCard>
          </div>

          <aside className="ag-offer-aside">
            <div className="agency-price">
              <span className="apx-tag">Pakiet startowy</span>
              <div className="apx-amt">2 500 <span>PLN</span></div>
              <p className="apx-note">{t('agency.offer.subtitle')}</p>
              <ul className="apx-list">
                {cardPoints.map((p) => (
                  <li key={p}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M5 12l5 5 9-11"/></svg>{p}</li>
                ))}
              </ul>
              <Link href={orderHref} className="apx-cta">{t('agency.offer.order')}</Link>
            </div>
          </aside>
        </div>
      </div>
    </AgencyTheme>
  )
}
