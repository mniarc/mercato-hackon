import { markStaleSocial, monthsBetween, type CollectedSource } from '../lib/research/fetch'

const post = (id: string, publishedAt: string): CollectedSource => ({
  source_id: id, url: `https://www.linkedin.com/posts/${id}`, publisher: 'Acme', kind: 'oficjalny kanał publiczny — wpis', channel: 'LinkedIn', origin: 'corpus',
  access: 'full', title: 'Acme — post', text: 'post', bytes: 4, retrieved_at: '2026-09-19T10:00:00.000Z', published_at: publishedAt, read_scope: 'whole post', limitation: null,
})
const site = (): CollectedSource => ({ ...post('S-01', '2026-01-01'), origin: 'purchase_form', kind: 'oficjalna strona', published_at: null })

describe('stale company socials — the website states the current offer', () => {
  const now = new Date('2026-09-19T10:00:00Z')

  it('counts whole months and tolerates unparseable dates', () => {
    expect(monthsBetween('2026-03-19', now)).toBe(6)
    expect(monthsBetween('2026-09-01', now)).toBe(0)
    expect(monthsBetween('not a date', now)).toBeNull()
  })

  it('marks only the dated posts when the channel is still active', () => {
    const sources = [site(), post('S-02', '2026-08-30'), post('S-03', '2025-11-02')]
    markStaleSocial(sources, now)
    expect(sources[0].limitation).toBeNull()
    expect(sources[1].limitation).toBeNull()
    expect(sources[2].limitation).toBe('dated post (10 months) — the website states the current offer')
  })

  it('marks the whole channel silent when its newest post is older than the threshold', () => {
    const sources = [site(), post('S-02', '2026-02-10'), post('S-03', '2025-06-01')]
    markStaleSocial(sources, now)
    expect(sources[1].limitation).toBe('dated post (7 months); no newer communication in the channel — the website states the current offer')
    expect(sources[2].limitation).toMatch(/^dated post \(15 months\); no newer communication/)
  })

  it('leaves a register without dated posts alone', () => {
    const sources = [site()]
    markStaleSocial(sources, now)
    expect(sources[0].limitation).toBeNull()
  })
})
