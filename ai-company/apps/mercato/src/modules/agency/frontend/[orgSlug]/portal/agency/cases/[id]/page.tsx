'use client'

import Link from 'next/link'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { PortalCard } from '@open-mercato/ui/portal/components/PortalCard'
import { CaseStatus } from '../../materials/_components/CaseStatus'
import { CaseConversation } from '../_components/CaseConversation'

export default function AgencyCasePage({ params }: { params: { orgSlug: string; id: string } }) {
  const t = useT()
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PortalPageHeader title={t('agency.cases.detailTitle')} action={(
        <Button type="button" asChild variant="outline">
          <Link href={`/${params.orgSlug}/portal/agency/cases`}>{t('agency.cases.back')}</Link>
        </Button>
      )} />
      <PortalCard><CaseStatus caseId={params.id} showMaterial /></PortalCard>
      <CaseConversation key={params.id} caseId={params.id} />
    </div>
  )
}
