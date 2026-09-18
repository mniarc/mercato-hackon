import { buildReviewRequest, canAcceptDocument, readDocumentReview, type DocumentReview } from '../data/document-review'

const brief: DocumentReview = {
  caseId: 'case-1', documentId: 'brief-1', versionId: 'brief-version-2', version: '2',
  templateId: 'WZR-BRIEF', title: 'Brief', html: '<h1>Brief</h1>',
  status: 'ready_for_review', isCurrent: true, mode: 'content',
}

const plan: DocumentReview = {
  ...brief, documentId: 'plan-1', versionId: 'plan-version-3', version: '3',
  templateId: 'WZR-PLAN', mode: 'topic_choice',
  topics: Array.from({ length: 12 }, (_, index) => ({ id: `topic-${index + 1}`, title: `Topic ${index + 1}`, readiness: 'ready' as const })),
}

const publication: DocumentReview = {
  ...brief, documentId: 'post-1', versionId: 'post-version-4', version: '4',
  templateId: 'WZR-POST', mode: 'publication', contentApproved: true,
  target: { id: 'target-1', ref: 'channel-42', label: '#announcements', platform: 'Discord' },
}

describe('readDocumentReview', () => {
  it.each([undefined, null, {}, { fields: [] }])('leaves ordinary task forms untouched: %p', (value) => {
    expect(readDocumentReview(value)).toEqual({ kind: 'other' })
  })

  it.each([undefined, null, {}, { ...brief, html: '' }])('rejects a present but malformed review marker: %p', (value) => {
    expect(readDocumentReview({ agencyReview: value })).toEqual({ kind: 'invalid' })
  })

  it('reads a valid review and preserves its exact version identity', () => {
    expect(readDocumentReview({ agencyReview: brief })).toEqual({ kind: 'review', review: brief })
  })

  it.each(['caseId', 'documentId', 'versionId', 'version'])('rejects a missing or blank %s', (field) => {
    expect(readDocumentReview({ agencyReview: { ...brief, [field]: undefined } })).toEqual({ kind: 'invalid' })
    expect(readDocumentReview({ agencyReview: { ...brief, [field]: '  ' } })).toEqual({ kind: 'invalid' })
  })
})

describe('document decisions', () => {
  it('approves only the displayed version, with no free text that could imply a change', () => {
    expect(buildReviewRequest(brief, 'accept', '', 'Accept, but change the audience', 'event-1')).toEqual({
      channel: 'portal', kind: 'approval', documentId: 'brief-1', versionId: 'brief-version-2', externalEventId: 'event-1',
    })
  })

  it.each(['approved', 'needs_review', 'blocked', 'draft'] as const)('refuses approval when the document is %s', (status) => {
    const review = { ...brief, status }
    expect(canAcceptDocument(review, '')).toBe(false)
    expect(() => buildReviewRequest(review, 'accept', '', '', 'event-1')).toThrow()
  })

  it('refuses approval of a superseded version', () => {
    expect(canAcceptDocument({ ...brief, isCurrent: false }, '')).toBe(false)
    expect(() => buildReviewRequest({ ...brief, isCurrent: false }, 'accept', '', '', 'event-1')).toThrow()
  })

  it('sends trimmed comments as a message tied to the reviewed version', () => {
    expect(buildReviewRequest(publication, 'comments', 'topic-1', '  Please change the opening.\n ', 'event-2')).toEqual({
      channel: 'portal', kind: 'message', documentId: 'post-1', versionId: 'post-version-4',
      externalEventId: 'event-2', body: 'Please change the opening.',
    })
  })

  it.each(['', '  ', '\n\t'])('rejects empty comments: %p', (body) => {
    expect(() => buildReviewRequest(brief, 'comments', '', body, 'event-2')).toThrow()
  })
})

describe('plan approval', () => {
  it('records exactly one topic belonging to the displayed plan', () => {
    expect(canAcceptDocument(plan, 'topic-7')).toBe(true)
    expect(buildReviewRequest(plan, 'accept', 'topic-7', '', 'event-3')).toEqual({
      channel: 'portal', kind: 'topic_choice', documentId: 'plan-1', versionId: 'plan-version-3',
      externalEventId: 'event-3', topicId: 'topic-7',
    })
  })

  it.each(['', 'unknown-topic', 'topic-1,topic-2'])('refuses absent, unknown, or combined topic selection: %p', (topicId) => {
    expect(canAcceptDocument(plan, topicId)).toBe(false)
    expect(() => buildReviewRequest(plan, 'accept', topicId, '', 'event-3')).toThrow()
  })

  it('requires all 12 topics to be present, unique and ready', () => {
    const topics = plan.topics!
    const invalidPlans: DocumentReview[] = [
      { ...plan, topics: undefined },
      { ...plan, topics: topics.slice(0, 11) },
      { ...plan, topics: [...topics, { ...topics[0], id: 'topic-13' }] },
      { ...plan, topics: topics.map((topic, index) => index === 11 ? { ...topic, id: 'topic-1' } : topic) },
      { ...plan, topics: topics.map((topic, index) => index === 11 ? { ...topic, readiness: 'blocked' } : topic) },
      { ...plan, mode: 'content' },
      { ...plan, templateId: 'WZR-BRIEF' },
    ]
    for (const review of invalidPlans) {
      expect(canAcceptDocument(review, 'topic-1')).toBe(false)
      expect(() => buildReviewRequest(review, 'accept', 'topic-1', '', 'event-3')).toThrow()
    }
  })
})

describe('publication consent', () => {
  it('records a distinct consent for the exact post version and destination', () => {
    expect(buildReviewRequest(publication, 'accept', '', '', 'event-4')).toEqual({
      channel: 'portal', kind: 'consent', documentId: 'post-1', versionId: 'post-version-4',
      targetId: 'target-1', targetRef: 'channel-42', externalEventId: 'event-4',
    })
    expect(buildReviewRequest({ ...publication, mode: 'content' }, 'accept', '', '', 'event-5')).toEqual({
      channel: 'portal', kind: 'approval', documentId: 'post-1', versionId: 'post-version-4', externalEventId: 'event-5',
    })
  })

  it('requires prior content approval and a concrete destination for a post', () => {
    const invalidReviews: DocumentReview[] = [
      { ...publication, contentApproved: false },
      { ...publication, contentApproved: undefined },
      { ...publication, target: undefined },
      { ...publication, templateId: 'WZR-BRIEF' },
    ]
    for (const review of invalidReviews) {
      expect(canAcceptDocument(review, '')).toBe(false)
      expect(() => buildReviewRequest(review, 'accept', '', '', 'event-4')).toThrow()
    }
  })
})
