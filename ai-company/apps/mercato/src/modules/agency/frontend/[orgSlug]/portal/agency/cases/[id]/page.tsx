'use client'

import Link from 'next/link'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { PortalCard } from '@open-mercato/ui/portal/components/PortalCard'
import { CaseStatus } from '../../materials/_components/CaseStatus'
import { CaseConversation } from '../_components/CaseConversation'
import { ClientCaseTasks } from '../_components/ClientCaseTasks'

export default function AgencyCasePage({ params }: { params: { orgSlug: string; id: string } }) {
  const t = useT()
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PortalPageHeader title={t('agency.cases.detailTitle')} action={(
        <Button type="button" asChild variant="outline">
          <Link href={`/${params.orgSlug}/portal/agency/cases`}>{t('agency.cases.back')}</Link>
        </Button>
      )} />
      <PortalCard>
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{t('agency.cases.intakeStatus')}</h2>
          <CaseStatus caseId={params.id} showMaterial />
          <p className="text-sm text-muted-foreground">{t('agency.cases.reviewTasksHint')}</p>
          <Button type="button" asChild>
            <Link href={`/${params.orgSlug}/portal/agency/cases/${encodeURIComponent(params.id)}/journey`}>{t('agency.journey.open')}</Link>
          </Button>
          <Button type="button" asChild variant="outline">
            <Link href={`/${params.orgSlug}/portal/agency/materials?caseId=${encodeURIComponent(params.id)}`}>{t('agency.materials.link')}</Link>
          </Button>
          <Button type="button" asChild variant="outline">
            <Link href={`/${params.orgSlug}/portal/tasks`}>{t('agency.cases.openTasks')}</Link>
          </Button>
        </div>
      </PortalCard>
      <ClientCaseTasks key={`tasks:${params.id}`} caseId={params.id} orgSlug={params.orgSlug} />
      <CaseConversation key={params.id} caseId={params.id} />
    </div>
  )
}
