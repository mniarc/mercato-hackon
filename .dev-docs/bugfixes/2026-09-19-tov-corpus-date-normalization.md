# LinkedIn `postedAt.date` kept un-normalised → wrong chronological order

- **Date:** 2026-09-19
- **Branch:** `bugfixes/tov-corpus-date-normalization` (from `bugfixes/main`)
- **Area:** `agency_tov` corpus normalisation
- **Regression test:** `ai-company/tests/regression/tov-corpus-date-normalization.test.ts`

## Symptom

Within a single LinkedIn voice profile, posts came back in the wrong
chronological order, and the reported first/last post dates could be wrong.

## Root cause

`normalizeLinkedInPosts` built each post's `postedAt` like this:

```ts
postedAt: item.postedAt?.date ?? (item.postedAt?.timestamp ? new Date(item.postedAt.timestamp).toISOString() : ''),
```

Apify's `linkedin-profile-posts` export gives `postedAt.date` as a **zone-less
`"YYYY-MM-DD HH:MM:SS"` string**, and the branch kept it verbatim. Posts that
only carry `postedAt.timestamp` instead fall back to an **ISO-8601 UTC string**
(`"…T…Z"`). So one profile could hold two different string shapes for the same
value — unlike the generic normaliser (`agency_tov/lib/corpus/generic.ts:asDate`)
and the timestamp branch here, which both emit ISO.

Every consumer of `postedAt` compares it as a **plain string**:

- `agency_tov/lib/corpus/index.ts` → `groupByProfile` sorts with `localeCompare`.
- `agency_tov/lib/corpus/index.ts` → `profileMetaFor` takes min/max with `<` / `>`.
- `agency_tov/lib/tov/batch.ts` → `dateRangeOf` likewise.

A space (`0x20`) sorts before `'T'` (`0x54`), so a `.date` post is ordered
**before** any `.timestamp` post of the same day regardless of the real time —
corrupting the chronological ordering the ToV pipeline relies on.

## Fix

Normalise `.date` (and the epoch fallback) to a single ISO-8601 form, matching
the convention already used by the generic normaliser:

```ts
function normalizePostedAt(postedAt: ApifyLinkedInPostItem['postedAt']): string {
  if (postedAt?.date) {
    const parsed = Date.parse(postedAt.date)
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString()
  }
  if (typeof postedAt?.timestamp === 'number') return new Date(postedAt.timestamp).toISOString()
  return ''
}
```

Behaviour is unchanged for inputs that were already ISO (a no-op round-trip), so
the existing `agency_tov/__tests__/corpus.test.ts` and the rest of the module's
32 unit tests stay green.

## Proof (red → green)

```bash
# from ai-company/
node node_modules/jest/bin/jest.js --config jest.regression.cjs tov-corpus-date-normalization
```

- **Before the fix:** both cases fail — `postedAt` came back as
  `"2024-01-15 08:30:00"` (not canonical ISO), and `groupByProfile` returned the
  same-day posts as `['later', 'earlier']`.
- **After the fix:** both cases pass — every `postedAt` round-trips through
  `Date`, and the posts order as `['earlier', 'later']`.
