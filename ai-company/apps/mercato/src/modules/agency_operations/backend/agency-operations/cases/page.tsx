import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { AgencyCasesTable } from './_components/AgencyCasesTable'

export default function AgencyCasesPage() {
  return (
    <Page>
      <PageBody>
        <AgencyCasesTable />
      </PageBody>
    </Page>
  )
}
