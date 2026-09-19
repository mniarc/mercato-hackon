"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import Link from 'next/link'
import { Button } from '@open-mercato/ui/primitives/button'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { PortalCard, PortalCardHeader } from '@open-mercato/ui/portal/components/PortalCard'

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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Button asChild variant="outline"><Link href={`/${orgSlug}/portal/agency/materials`}>{t('agency.materials.link')}</Link></Button>
      <PortalPageHeader
        label={t('agency.offer.label')}
        title={t('agency.offer.productName')}
        description={t('agency.offer.description')}
        action={
          <Link href={orderHref}>
            <Button>{t('agency.offer.order')}</Button>
          </Link>
        }
      />

      <PortalCard>
        <PortalCardHeader
          label={t('agency.purchase.demoOffer', 'Demo offer')}
          title={t('agency.purchase.testPrice', '2,500 PLN — test amount')}
          description={t('agency.offer.subtitle')}
        />
        <p className="text-sm text-muted-foreground">{t('agency.purchase.noCharge', 'Demo only. No money is charged and no paid agent calls are authorized.')}</p>
        <p className="text-sm text-muted-foreground">
          {t('agency.offer.audience')}
        </p>
      </PortalCard>

      <PortalCard>
        <PortalCardHeader title={t('agency.offer.includedTitle')} />
        <ul className="list-disc space-y-2 pl-5 text-sm text-foreground">
          {included.map((item) => (
            <li key={item}>{t(item)}</li>
          ))}
        </ul>
      </PortalCard>

      <PortalCard>
        <PortalCardHeader title={t('agency.offer.processTitle')} />
        <p className="text-sm text-muted-foreground">
          {t('agency.offer.process')}
        </p>
      </PortalCard>

      <PortalCard>
        <PortalCardHeader title={t('agency.offer.boundariesTitle')} />
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          {boundaries.map((item) => (
            <li key={item}>{t(item)}</li>
          ))}
        </ul>
      </PortalCard>

      <div className="flex justify-end">
        <Link href={orderHref}>
          <Button size="lg">{t('agency.offer.orderProduct', { productName: t('agency.offer.productName') })}</Button>
        </Link>
      </div>
    </div>
  )
}
