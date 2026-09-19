import { applyBriefAnswers } from '../applyAnswers'
import { briefRevisionRequestSchema, type BriefRevisionRequest } from '../contracts'
import type { UstaleniaData } from '../../../data/schemas/ustalenia'

const source = {
  submissionId: '11111111-1111-4111-8111-111111111111', eventId: 'brief:task:response-hash',
  customerUserId: '22222222-2222-4222-8222-222222222222', workflowInstanceId: '33333333-3333-4333-8333-333333333333',
  invitationTaskId: '44444444-4444-4444-8444-444444444444',
}
const request: BriefRevisionRequest = {
  orderRef: 'case', briefVersionId: '55555555-5555-4555-8555-555555555555', source,
  originalText: 'We serve agency owners. Our priority is qualified conversations.', maxCostPln: 2,
}
const findings = (): UstaleniaData => ({
  field_map: ['priority_audience', 'business_direction'].map((field_key) => ({
    field_key: field_key as 'priority_audience' | 'business_direction', proposed_value: 'research proposal', evidence_ids: ['F01'],
    provenance: 'inferred', readiness: 'conditional', decision_state: 'awaiting_client', priority: 'must', reason: 'Client must choose.', status: 'hypothesis',
  })),
  questions: ['priority_audience', 'business_direction'].map((brief_field, index) => ({
    question_id: `Q0${index + 1}`, brief_field: brief_field as 'priority_audience' | 'business_direction',
    question: `Choose ${brief_field}`, hint: 'Own decision', reason: 'Required', priority: 'must', if_unanswered: 'Stay open', state: 'open',
  })),
  evidence_requests: [{ request_id: 'E01', needed: 'Proof', claim_supported: 'Result', without_it: 'No promise', owner: 'client', status: 'open', priority: 'must' }],
  readiness: [], research_return: [],
})

test('binds an explicit answer to its source and leaves unanswered fields and evidence untouched', () => {
  const original = findings()
  const result = applyBriefAnswers({ findings: original, invitedQuestionIds: ['Q01', 'Q02'], request,
    proposal: { answers: [{ questionId: 'Q01', value: 'We serve agency owners.', quote: 'We serve agency owners.' }] } })
  expect(result.data.field_map[0]).toMatchObject({ proposed_value: 'We serve agency owners.', provenance: 'client_answer', status: 'client_decision', decision_state: 'client_selected' })
  expect(result.data.field_map[0].reason).toContain(source.submissionId)
  expect(result.data.field_map[1]).toEqual(original.field_map[1])
  expect(result.data.evidence_requests).toEqual(original.evidence_requests)
  expect(result.answeredQuestionIds).toEqual(['Q01'])
  expect(result.unresolvedQuestionIds).toEqual(['Q02'])
  expect(original.questions[0].state).toBe('open')
  expect(briefRevisionRequestSchema.parse(request).source.eventId).toBe(source.eventId)
})

test.each([
  { questionId: 'not-invited', value: 'We serve agency owners.', quote: 'We serve agency owners.' },
  { questionId: 'Q01', value: 'Different invented choice', quote: 'We serve agency owners.' },
  { questionId: 'Q01', value: 'Missing from original', quote: 'Missing from original' },
])('rejects an unbound answer proposal %j', (answer) => {
  expect(() => applyBriefAnswers({ findings: findings(), invitedQuestionIds: ['Q01'], request, proposal: { answers: [answer] } })).toThrow('not grounded')
})

test('a later answer preserves the prior answered portion while the same field still has another question', () => {
  const data = findings()
  data.questions[1].brief_field = 'priority_audience'
  data.questions[0].state = 'resolved_by_client'
  data.field_map[0].proposed_value = 'We serve agency owners.'
  const result = applyBriefAnswers({ findings: data, invitedQuestionIds: ['Q02'], request,
    proposal: { answers: [{ questionId: 'Q02', value: 'Our priority is qualified conversations.', quote: 'Our priority is qualified conversations.' }] } })
  expect(result.data.field_map[0].proposed_value).toBe('We serve agency owners.\nOur priority is qualified conversations.')
})
