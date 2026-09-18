'use client'

import * as React from 'react'
import Link from 'next/link'
import StandardTasksPage from '@open-mercato/core/modules/workflows/frontend/[orgSlug]/portal/tasks/page'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'

export default function AgencyTasksPage({ params }: { params: { orgSlug: string } }) {
  const t = useT()
  return <div className="space-y-6">
    <div className="flex justify-end"><Button type="button" variant="outline" asChild><Link href={`/${params.orgSlug}/portal/agency/tasks-demo`}>{t('agency.demo.open')}</Link></Button></div>
    <StandardTasksPage params={params} />
  </div>
}
