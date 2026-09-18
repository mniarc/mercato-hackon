import MaterialSubmission from './_components/MaterialSubmission'

export default function AgencyMaterialsPage({ params }: { params: { orgSlug: string } }) {
  return <MaterialSubmission orgSlug={params.orgSlug} />
}
