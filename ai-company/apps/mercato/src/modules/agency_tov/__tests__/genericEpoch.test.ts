import { normalizeGenericPosts } from '../lib/corpus/generic'

const fields = {
  id: ['id'], text: ['body'], url: ['link'], postedAt: ['when'],
  authorName: ['author'], profileUrl: ['profile'],
  likes: ['likes'], comments: ['comments'], shares: ['shares'],
}

function normalizeDate(when: unknown): string {
  const result = normalizeGenericPosts(
    [{ id: 'post', body: 'Launch recap and what we learned.', link: 'https://x.com/acme/status/1', when }],
    { source: 'x', fields, fallbackProfileUrl: 'https://x.com/acme', fallbackAuthorName: 'Acme' },
  )
  expect(result.posts).toHaveLength(1)
  return result.posts[0].postedAt
}

describe('generic corpus epoch dates', () => {
  it.each(['1700000000', '1700000000000', 1700000000, 1700000000000])(
    'normalizes seconds or milliseconds: %s',
    (when) => expect(normalizeDate(when)).toBe('2023-11-14T22:13:20.000Z'),
  )

  it('does not interpret packed YYYYMMDD as an epoch', () => {
    expect(normalizeDate('20231005')).toBe('1970-01-01T00:00:00.000Z')
  })

  it.each([NaN, Infinity, -Infinity, 1e20, -1e20, '999999999999999999999999999999'])(
    'keeps the existing fallback for invalid epochs without throwing: %s',
    (when) => expect(normalizeDate(when)).toBe('1970-01-01T00:00:00.000Z'),
  )
})
