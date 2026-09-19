import { SalesQuestions } from '../../../../../components/sales-questions/SalesQuestions'

export default function SalesQuestionsPage({ params }: { params: { orgSlug: string } }) {
  return <SalesQuestions orgSlug={params.orgSlug} />
}
