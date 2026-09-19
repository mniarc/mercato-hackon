# Generic corpus normaliser dropped string epoch timestamps to 1970

- **Date:** 2026-09-19
- **Branch:** `bugfixes/generic-epoch-timestamp` (from `bugfixes/main`)
- **Area:** `agency_tov` corpus — generic normaliser `asDate`
- **Regression test:** `ai-company/tests/regression/research-generic-epoch-timestamp.test.ts`

## Symptom

For any source normalised through the generic adapter (X, Facebook, Instagram,
website, `other`) whose scraper delivered `postedAt` as a **string epoch**
(e.g. `"1700000000"`), every post silently took the `1970-01-01` sentinel — so
that source's chronological order and its `dateRangeOf` collapsed to 1970.

## Root cause

`asDate` (`agency_tov/lib/corpus/generic.ts`) handled a numeric epoch but not a
string one:

```ts
if (typeof value === 'number') return new Date(value < 1e12 ? value * 1000 : value).toISOString()
if (typeof value === 'string') {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
}
```

`Date.parse("1700000000")` is `NaN` (a bare number is not a recognised date
string), so the value became `null` → `normalizeGenericPosts` substituted
`'1970-01-01T00:00:00.000Z'`. The numeric branch's `value < 1e12 ? *1000`
detection shows epochs were expected; only the *type* (string vs number) was the
gap, and JSON scrapes routinely serialise timestamps as strings. This is the
same class as the fixed LinkedIn `postedAt.date` bug: an unhandled external date
representation corrupting the stored date.

## Fix

Try `Date.parse` first (so ISO strings, the Twitter `createdAt` format and even a
bare year still parse), then treat a bare, epoch-scale digit string the same way
the numeric branch does:

```ts
if (typeof value === 'string') {
  const trimmed = value.trim()
  const parsed = Date.parse(trimmed)
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString()
  if (/^\d+$/.test(trimmed) && Number(trimmed) >= 1e9) {
    const epoch = Number(trimmed)
    return new Date(epoch < 1e12 ? epoch * 1000 : epoch).toISOString()
  }
  return null
}
```

The `>= 1e9` floor keeps a short packed number such as `20231005` (YYYYMMDD) from
being misread as an epoch — it stays the sentinel rather than becoming a nonsense
1970-08 date. Every value that already parsed is untouched, so the 32
`agency_tov` unit tests stay green.

## Proof (red → green)

```bash
# from ai-company/
node node_modules/jest/bin/jest.js --config jest.regression.cjs research-generic-epoch
```

- **Before the fix:** a `"1700000000"` postedAt normalised to
  `1970-01-01T00:00:00.000Z` instead of `2023-11-14T22:13:20.000Z`.
- **After the fix:** string epochs in seconds and milliseconds read as the real
  date; a non-epoch digit string (`20231005`) still declines rather than
  misreading.
