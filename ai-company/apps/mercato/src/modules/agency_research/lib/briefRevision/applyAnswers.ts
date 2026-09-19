import { ustaleniaDataSchema, type UstaleniaData } from '../../data/schemas/ustalenia'
import type { BriefAnswerProposal, BriefRevisionRequest } from './contracts'

export function applyBriefAnswers(input: {
  findings: UstaleniaData
  invitedQuestionIds: string[]
  request: BriefRevisionRequest
  proposal: BriefAnswerProposal
}): { data: UstaleniaData; answeredQuestionIds: string[]; unresolvedQuestionIds: string[] } {
  const data = ustaleniaDataSchema.parse(input.findings)
  const invited = new Set(input.invitedQuestionIds)
  const answers = new Map<string, BriefAnswerProposal['answers'][number]>()
  for (const answer of input.proposal.answers) {
    const question = data.questions.find((item) => item.question_id === answer.questionId)
    if (!question || !invited.has(answer.questionId) || /^resolved/.test(question.state)
      || answers.has(answer.questionId) || answer.quote !== answer.value
      || !answer.quote.trim() || !input.request.originalText.includes(answer.quote)) {
      throw new Error('[internal] brief answer proposal is not grounded in the invited question and original response')
    }
    answers.set(answer.questionId, answer)
  }
  for (const question of data.questions) {
    if (answers.has(question.question_id)) question.state = 'resolved_by_client'
  }
  for (const field of data.field_map) {
    const matching = data.questions.filter((question) => question.brief_field === field.field_key)
    const answered = matching.flatMap((question) => {
      const answer = answers.get(question.question_id)
      return answer ? [answer] : []
    })
    if (!answered.length) continue
    const stillOpen = matching.some((question) => !/^resolved/.test(question.state))
    const hasPreviousAnswer = input.findings.questions.some((question) => question.brief_field === field.field_key && /^resolved/.test(question.state))
    field.proposed_value = [hasPreviousAnswer ? field.proposed_value : null, ...answered.map((answer) => answer.value)].filter(Boolean).join('\n')
    field.provenance = 'client_answer'
    field.status = 'client_decision'
    field.decision_state = stillOpen ? 'awaiting_client' : 'client_selected'
    field.readiness = stillOpen ? 'conditional' : 'ready'
    field.reason = `${field.reason}\nClient answer: ${input.request.source.submissionId}; event: ${input.request.source.eventId}; questions: ${answered.map((answer) => answer.questionId).join(', ')}`
  }
  return {
    data, answeredQuestionIds: [...answers.keys()],
    unresolvedQuestionIds: data.questions.filter((question) => !/^resolved/.test(question.state)).map((question) => question.question_id),
  }
}
