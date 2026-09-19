/** @jest-environment node */
import { collectSources, type FetchPage, type SocialPost } from '@/modules/agency_research/lib/research/fetch'
import type { OrderFacts } from '@/modules/agency_research/data/schemas/zamowienie'

/**
 * Regression: `collectSources` must store a social-corpus post's text VERBATIM.
 *
 * The attachment path documents "Preserve its text verbatim for the existing
 * quote grounding" and builds its source inline. The social-corpus path instead
 * routed the post through `record()` → `stripBoilerplate()` (web-page cleanup:
 * drops link-only and <=2-word lines), then overwrote `read_scope` to claim the
 * "whole post from the stored corpus". So a real post with a short CTA/hashtag
 * line had that line silently dropped from the stored text, while read_scope
 * claimed it was whole — and a client quote from the dropped line then fails the
 * verbatim grounding gate.
 */
const order: OrderFacts = {
  brand: 'FLOW', websiteUrl: 'https://flow.example/', market: 'PL', language: 'pl',
  outputLanguage: 'pl', officialSocialUrl: 'https://linkedin.com/company/flow/',
  officialSocialPlatform: 'LinkedIn', purchaseGoal: null, sku: 'DEMO', topics: 12,
}

// Home fetch fails, so no web text competes and the order text cap is not in play.
const fetchPage: FetchPage = async (url) => ({ url, finalUrl: url, status: 'unavailable', title: null, markdown: null, error: 'offline' })

// A realistic post: a paragraph followed by a two-word call to action on its own line.
const post: SocialPost = {
  id: 'p1', url: 'https://linkedin.com/posts/flow-p1', authorName: 'FLOW',
  postedAt: '2026-08-20T09:00:00.000Z',
  text: 'We shipped the new dashboard today and it already cut onboarding time in half for the first ten teams.\n\nRead more',
  likes: 40, comments: 5, shares: 2,
}

describe('collectSources — social corpus posts', () => {
  it('stores the post text verbatim rather than boilerplate-stripped', async () => {
    const sources = await collectSources(order, { fetchPage, socialPosts: [post], now: () => new Date('2026-09-19T10:00:00Z') })
    const corpus = sources.find((source) => source.origin === 'corpus')
    expect(corpus).toBeDefined()
    expect(corpus!.text).toBe(post.text)
    expect(corpus!.access).toBe('full')
  })
})
