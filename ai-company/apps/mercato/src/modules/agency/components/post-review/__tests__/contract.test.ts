import { buildPostReviewRequest, type PostReview } from '../contract'

const review: PostReview = { caseId: 'case', post: { caseId: 'case', documentId: 'post', versionId: 'v1', version: '1.0', templateId: 'WZR-POST', title: 'Post', html: '<p>Original post</p>', status: 'ready_for_review', isCurrent: true, mode: 'content' } }

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
