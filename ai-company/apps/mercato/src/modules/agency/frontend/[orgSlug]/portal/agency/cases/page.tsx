import { ClientCases } from './_components/ClientCases'

export default function AgencyCasesPage({ params }: { params: { orgSlug: string } }) {
  return <ClientCases orgSlug={params.orgSlug} />
}
