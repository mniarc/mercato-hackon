import { normalizeLinkedInPosts, type ApifyLinkedInPostItem } from '@/modules/agency_tov/lib/corpus/linkedin'
import { groupByProfile, profileMetaFor } from '@/modules/agency_tov/lib/corpus/index'

/**
 * Regression: agency_tov corpus — LinkedIn `postedAt` normalisation.
 *
 * Apify's `linkedin-profile-posts` export gives `postedAt.date` as a zone-less
 * "YYYY-MM-DD HH:MM:SS" string, while posts that only carry `postedAt.timestamp`
 * fall back to an ISO-8601 UTC string. `normalizeLinkedInPosts` used to keep the
 * `.date` string verbatim, so a single profile could hold two different string
 * shapes for the same kind of value. Every consumer of `postedAt` compares it as
 * a plain string — `groupByProfile` sorts with `localeCompare`, `profileMetaFor`
 * takes min/max with `<`/`>` — and a space (0x20) sorts before 'T' (0x54), so a
 * `.date` post is always ordered before a `.timestamp` post of the same day
 * regardless of the real time. The fix normalises `.date` to the same ISO form.
 */
const PROFILE = 'https://linkedin.com/in/x/'

function post(id: string, postedAt: ApifyLinkedInPostItem['postedAt']): ApifyLinkedInPostItem {
  return {
    type: 'post',
    id,
    content: `content of post ${id}`,
    linkedinUrl: `https://linkedin.com/posts/${id}`,
    query: { targetUrl: PROFILE },
    postedAt,
  }
}

describe('agency_tov linkedin postedAt normalisation', () => {
  it('emits every postedAt in one canonical ISO-8601 form', () => {
    const { posts } = normalizeLinkedInPosts([
      post('from-date', { date: '2024-01-15 08:30:00' }),
      post('from-timestamp', { timestamp: Date.parse('2024-01-16T09:00:00.000Z') }),
    ])
    expect(posts).toHaveLength(2)
    for (const p of posts) {
      // A canonical ISO string round-trips through Date unchanged; a raw
      // "YYYY-MM-DD HH:MM:SS" string does not.
      expect(new Date(p.postedAt).toISOString()).toBe(p.postedAt)
    }
  })

  it('orders same-profile posts chronologically across .date and .timestamp sources', () => {
    // `later` is 22:00 on Jan 15 in any zone, i.e. its UTC instant is at earliest
    // 2024-01-15T08:00Z — unambiguously after `earlier` at 2024-01-15T05:00Z.
    const { posts } = normalizeLinkedInPosts([
      post('later', { date: '2024-01-15 22:00:00' }),
      post('earlier', { timestamp: Date.parse('2024-01-15T05:00:00.000Z') }),
    ])
    const ordered = groupByProfile(posts).get(PROFILE)!.map((p) => p.id)
    expect(ordered).toEqual(['earlier', 'later'])

    const meta = profileMetaFor(PROFILE, posts)
    expect(new Date(meta.firstPostedAt!).getTime()).toBeLessThan(new Date(meta.lastPostedAt!).getTime())
  })
})
