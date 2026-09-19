'use client'

import * as React from 'react'
import StandardTasksPage from '@open-mercato/core/modules/workflows/frontend/[orgSlug]/portal/tasks/page'
import { AgencyJourneyLinks } from './journey/AgencyJourneyLinks'

export default function AgencyTasksPage({ params }: { params: { orgSlug: string } }) {
  return <div className="space-y-6">
    <AgencyJourneyLinks orgSlug={params.orgSlug} showOffer />
    <StandardTasksPage params={params} />
  </div>
}
