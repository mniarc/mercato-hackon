'use client'

import StandardDashboardPage from '@open-mercato/core/modules/portal/frontend/[orgSlug]/portal/dashboard/page'
import { usePortalContext } from '@open-mercato/ui/portal/PortalContext'
import { AgencyJourneyLinks } from './AgencyJourneyLinks'

export default function AgencyDashboardPage({ params }: { params: { orgSlug: string } }) {
  const { auth } = usePortalContext()
  return <div className="space-y-6">
    {auth.user ? <AgencyJourneyLinks orgSlug={params.orgSlug} showOffer /> : null}
    <StandardDashboardPage params={params} />
  </div>
}
