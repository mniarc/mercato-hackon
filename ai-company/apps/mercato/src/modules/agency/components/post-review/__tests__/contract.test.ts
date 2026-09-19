import { buildPostReviewRequest, postReviewKey, type PostReview } from '../contract'

const review: PostReview = { caseId: 'case', post: { caseId: 'case', documentId: 'post', versionId: 'v1', version: '1.0', templateId: 'WZR-POST', title: 'Post', html: '<p>Original post</p>', status: 'ready_for_review', isCurrent: true, mode: 'content' } }
const targetedReview: PostReview = { ...review, publicationTarget: {
  configVersionId: 'config-v1', platform: 'linkedin', accountId: 'account-1', channelId: null, displayName: 'Company page',
} }

test('requires explicit content approval and emits no publication decision', () => {
  expect(() => buildPostReviewRequest(review, { kind: 'approval' }, 'event')).toThrow()
  expect(buildPostReviewRequest(review, { kind: 'approval', approveContent: true }, 'event')).toEqual({
    channel: 'portal', kind: 'approval', post: { documentId: 'post', versionId: 'v1' }, approveContent: true, externalEventId: 'event',
  })
})

test('conditional message stays unchanged without hidden approval and stale posts cannot respond', () => {
  const body = '  I approve, but change the ending.\nHold publication.  '
  expect(buildPostReviewRequest(review, { kind: 'message', body, approveContent: true }, 'event')).toEqual({
    channel: 'portal', kind: 'message', post: { documentId: 'post', versionId: 'v1' }, body, externalEventId: 'event',
  })
  expect(() => buildPostReviewRequest({ ...review, post: { ...review.post, isCurrent: false } }, { kind: 'message', body }, 'event')).toThrow()
})

test('adds exact configuration consent only after an independent explicit choice', () => {
  expect(buildPostReviewRequest(targetedReview, { kind: 'approval', approveContent: true, consentToPublication: true }, 'event'))
    .toMatchObject({ publicationConsent: { configVersionId: 'config-v1', consent: true } })
  for (const consentToPublication of [undefined, false]) {
    expect(buildPostReviewRequest(targetedReview, { kind: 'approval', approveContent: true, consentToPublication }, 'event'))
      .not.toHaveProperty('publicationConsent')
  }
  expect(() => buildPostReviewRequest(targetedReview, { kind: 'approval', consentToPublication: true }, 'event')).toThrow()
})

test('never sends publication consent without a target or alongside a message', () => {
  expect(buildPostReviewRequest(review, { kind: 'approval', approveContent: true, consentToPublication: true }, 'event'))
    .not.toHaveProperty('publicationConsent')
  expect(buildPostReviewRequest(targetedReview, { kind: 'message', body: 'Please change this.', consentToPublication: true }, 'event'))
    .not.toHaveProperty('publicationConsent')
})

test('a different configured destination resets form identity', () => {
  expect(postReviewKey(targetedReview)).not.toBe(postReviewKey({ ...targetedReview,
    publicationTarget: { ...targetedReview.publicationTarget!, configVersionId: 'config-v2' },
  }))
})
