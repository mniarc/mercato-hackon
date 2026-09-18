import { ReviewDemo } from '../../../../../components/ReviewDemo'

export default function ReviewDemoPage({ params }: { params: { orgSlug: string } }) {
  return <ReviewDemo orgSlug={params.orgSlug} />
}
