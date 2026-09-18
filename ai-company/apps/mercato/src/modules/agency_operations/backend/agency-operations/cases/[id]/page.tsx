import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { AgencyCaseDetail } from './_components/AgencyCaseDetail'

export default function AgencyCaseDetailPage({ params }: { params?: { id?: string } }) {
  return (
    <Page>
      <PageBody>
        <AgencyCaseDetail caseId={params?.id} />
      </PageBody>
    </Page>
  )
}
