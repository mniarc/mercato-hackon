import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ResearchOrdersTable } from './_components/ResearchOrdersTable'

export default function AgencyResearchOrdersPage() {
  return (
    <Page>
      <PageBody>
        <ResearchOrdersTable />
      </PageBody>
    </Page>
  )
}
