"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import Link from 'next/link'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { PortalCard, PortalCardHeader } from '@open-mercato/ui/portal/components/PortalCard'
import { AgencyTheme } from './_components/AgencyTheme'

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

const OFFER_CSS = `
.ag-offer-grid{display:grid;grid-template-columns:1.55fr 1fr;gap:22px;align-items:start}
.ag-offer-aside{position:sticky;top:88px}
.agency-price .apx-list{list-style:none;margin:16px 0 20px;padding:0;display:flex;flex-direction:column;gap:10px}
.agency-price .apx-list li{position:relative;display:flex;gap:9px;align-items:flex-start;font-size:13.5px;color:rgba(255,255,255,.94)}
.agency-price .apx-list li svg{width:16px;height:16px;flex:none;margin-top:1px;opacity:.9}
.agency-price .apx-cta{display:flex;justify-content:center;align-items:center;width:100%;padding:12px;border-radius:12px;background:#fff;color:#5a3fd0;font-size:14px;font-weight:500;text-decoration:none}
.agency-price .apx-cta:hover{filter:brightness(1.02)}
@media (max-width:900px){ .ag-offer-grid{grid-template-columns:1fr} .ag-offer-aside{position:static} }
`

