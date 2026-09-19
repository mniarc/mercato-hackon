import { collectSources, type FetchPage, type SocialPost } from '../lib/research/fetch'
import type { OrderFacts } from '../data/schemas/zamowienie'

const order: OrderFacts = {
  brand: 'FLOW', websiteUrl: 'https://flow.example/', market: 'PL', language: 'pl',
  outputLanguage: 'pl', officialSocialUrl: 'https://linkedin.com/company/flow/',
  officialSocialPlatform: 'LinkedIn', purchaseGoal: null, sku: 'DEMO', topics: 12,
}

const fetchPage: FetchPage = async (url) => ({ url, finalUrl: url, status: 'unavailable', title: null, markdown: null, error: 'offline' })

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
