import { buildPlanReviewRequest, type PlanReview } from '../contract'

const review: PlanReview = {
  caseId: 'case', plan: { caseId: 'case', documentId: 'plan', versionId: 'v1', version: '1.0', templateId: 'WZR-PLAN', title: 'Saved plan', html: '<p>Plan</p>', status: 'ready_for_review', isCurrent: true, mode: 'content' },
  topics: [{ topicId: 'a', title: 'Recommended', recommended: true }, { topicId: 'b', title: 'Client choice', recommended: false }],
  recommendedTopicId: 'a',
}

test('requires explicit approval and one existing topic; never falls back to the recommendation', () => {
  for (const values of [
    { kind: 'approval', selectedTopicId: 'b' },
    { kind: 'approval', approvePlan: true },
    { kind: 'approval', approvePlan: true, selectedTopicId: '' },
    { kind: 'approval', approvePlan: true, selectedTopicId: 'foreign' },
  ]) expect(() => buildPlanReviewRequest(review, values, 'event')).toThrow()
  expect(buildPlanReviewRequest(review, { kind: 'approval', approvePlan: true, selectedTopicId: 'b' }, 'event')).toEqual({
    channel: 'portal', kind: 'approval', plan: { documentId: 'plan', versionId: 'v1' }, approvePlan: true, selectedTopicId: 'b', externalEventId: 'event',
  })
})

test('preserves original message and omits hidden approval fields', () => {
  const body = '  Hold this work.\nPlease explain the recommendation.  '
  expect(buildPlanReviewRequest(review, { kind: 'message', body, approvePlan: true, selectedTopicId: 'a' }, 'event')).toEqual({
    channel: 'portal', kind: 'message', plan: { documentId: 'plan', versionId: 'v1' }, body, externalEventId: 'event',
  })
  expect(() => buildPlanReviewRequest({ ...review, plan: { ...review.plan, isCurrent: false } }, { kind: 'message', body }, 'event')).toThrow()
})
