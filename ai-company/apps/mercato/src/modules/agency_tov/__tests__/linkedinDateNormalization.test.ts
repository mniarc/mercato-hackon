import { normalizeLinkedInPosts, type ApifyLinkedInPostItem } from '../lib/corpus/linkedin'
import { groupByProfile, profileMetaFor } from '../lib/corpus/index'

const PROFILE = 'https://linkedin.com/in/x/'

function post(id: string, postedAt: ApifyLinkedInPostItem['postedAt']): ApifyLinkedInPostItem {
  return {
    type: 'post', id, content: `content of post ${id}`,
    linkedinUrl: `https://linkedin.com/posts/${id}`,
    query: { targetUrl: PROFILE }, postedAt,
  }
}

describe('LinkedIn corpus dates', () => {
  it.each(['2024-01-15 08:30:00', '2024-01-15T08:30:00', '2024-01-15T10:30:00+02:00'])(
    'normalizes scraper dates to UTC independently of host timezone: %s',
    (date) => {
      const { posts } = normalizeLinkedInPosts([post('date', { date })])
      expect(posts[0].postedAt).toBe('2024-01-15T08:30:00.000Z')
    },
  )

  it('prefers the native timestamp when the date text disagrees', () => {
    const { posts } = normalizeLinkedInPosts([post('both', {
      date: '2024-01-15 10:30:00', timestamp: Date.parse('2024-01-15T08:30:00Z'),
    })])
    expect(posts[0].postedAt).toBe('2024-01-15T08:30:00.000Z')
  })

  it('orders and ranges mixed date and timestamp posts chronologically', () => {
    const { posts } = normalizeLinkedInPosts([
      post('later', { date: '2024-01-15 22:00:00' }),
      post('earlier', { timestamp: Date.parse('2024-01-15T05:00:00Z') }),
    ])
    expect(groupByProfile(posts).get(PROFILE)!.map((item) => item.id)).toEqual(['earlier', 'later'])
    expect(profileMetaFor(PROFILE, posts)).toMatchObject({
      firstPostedAt: '2024-01-15T05:00:00.000Z', lastPostedAt: '2024-01-15T22:00:00.000Z',
    })
  })

  it.each([NaN, Infinity, -Infinity, 1e20, -1e20])('handles invalid timestamps without throwing: %s', (timestamp) => {
    const { posts, skipped } = normalizeLinkedInPosts([
      post('fallback', { timestamp, date: '2024-01-15 08:30:00' }),
      post('invalid', { timestamp, date: 'not a date' }),
    ])
    expect(posts.map((item) => item.postedAt)).toEqual(['2024-01-15T08:30:00.000Z'])
    expect(skipped).toEqual([{ reason: 'invalid', id: 'invalid' }])
  })
})
