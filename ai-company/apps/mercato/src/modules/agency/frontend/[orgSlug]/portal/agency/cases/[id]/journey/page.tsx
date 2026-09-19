'use client'

import { CaseJourney } from '@/modules/agency/components/journey/CaseJourney'

export default function AgencyCaseJourneyPage({ params }: { params: { orgSlug: string; id: string } }) {
  return <CaseJourney key={`${params.orgSlug}:${params.id}`} orgSlug={params.orgSlug} caseId={params.id} />
}
