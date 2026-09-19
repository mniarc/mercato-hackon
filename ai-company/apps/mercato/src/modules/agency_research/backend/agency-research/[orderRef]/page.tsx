import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ResearchOrderDetail } from './_components/ResearchOrderDetail'

export default function AgencyResearchOrderPage({ params }: { params?: { orderRef?: string } }) {
  return (
    <Page>
      <PageBody>
        <ResearchOrderDetail orderRef={params?.orderRef ? decodeURIComponent(params.orderRef) : undefined} />
      </PageBody>
    </Page>
  )
}
