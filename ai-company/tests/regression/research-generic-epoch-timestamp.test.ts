/** @jest-environment node */
import { normalizeGenericPosts } from '@/modules/agency_tov/lib/corpus/generic'

/**
 * Regression: the generic corpus normaliser must read an epoch `postedAt` that a
 * scraper delivered as a STRING, not only as a number.
 *
 * `asDate` handled a numeric epoch (its `value < 1e12 ? value * 1000` branch), but
 * a string epoch (`"1700000000"`) fell through to `Date.parse`, which returns NaN
 * for a bare number — so the post silently took the `1970-01-01` sentinel. JSON
 * scrapes routinely serialise timestamps as strings, and this is the "best-effort,
 * unpinned shapes" path, so a whole source could lose every real date (its
 * chronological order and `dateRangeOf` collapse to 1970).
 */
const fields = {
  id: ['id'], text: ['body'], url: ['link'], postedAt: ['when'],
  authorName: ['author'], profileUrl: ['profile'],
  likes: ['likes'], comments: ['comments'], shares: ['shares'],
}

describe('normalizeGenericPosts — epoch postedAt as a string', () => {
  it('reads a string epoch (seconds and milliseconds) as the real date', () => {
    const seconds = normalizeGenericPosts(
      [{ id: 's', body: 'Launch recap and what we learned.', link: 'https://x.com/acme/status/1', when: '1700000000' }],
      { source: 'x', fields, fallbackProfileUrl: 'https://x.com/acme', fallbackAuthorName: 'Acme' },
    )
    expect(seconds.posts).toHaveLength(1)
    expect(seconds.posts[0].postedAt).toBe(new Date(1700000000 * 1000).toISOString())

    const millis = normalizeGenericPosts(
      [{ id: 'm', body: 'A second post about the roadmap.', link: 'https://x.com/acme/status/2', when: '1700000000000' }],
      { source: 'x', fields, fallbackProfileUrl: 'https://x.com/acme', fallbackAuthorName: 'Acme' },
    )
    expect(millis.posts[0].postedAt).toBe(new Date(1700000000000).toISOString())
  })

  it('still rejects a non-epoch digit string (e.g. YYYYMMDD) rather than misreading it', () => {
    const result = normalizeGenericPosts(
      [{ id: 'd', body: 'A post whose date field is a packed YYYYMMDD number.', link: 'https://x.com/acme/status/3', when: '20231005' }],
      { source: 'x', fields, fallbackProfileUrl: 'https://x.com/acme', fallbackAuthorName: 'Acme' },
    )
    // Not a plausible epoch -> falls back to the sentinel rather than 1970-08 nonsense.
    expect(result.posts[0].postedAt).toBe('1970-01-01T00:00:00.000Z')
  })
})
