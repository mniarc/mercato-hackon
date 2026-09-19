# Social-corpus posts were boilerplate-stripped, breaking verbatim grounding

- **Date:** 2026-09-19
- **Branch:** `bugfixes/corpus-adapters` (from `bugfixes/main`)
- **Area:** `agency_research` research fetch — `collectSources`
- **Regression test:** `ai-company/tests/regression/research-corpus-social-verbatim.test.ts`

## Symptom

A client quote taken from a social post could fail the verbatim quote-grounding
gate even though the quote was genuinely in the post — and the source's
`read_scope` claimed the "whole post" was stored when part of it had been
dropped.

## Root cause

`collectSources` (`agency_research/lib/research/fetch.ts`) records a stored-corpus
social post through the shared `record()` helper, which runs
`stripBoilerplate()` — cleanup meant for **fetched web pages** that drops
link-only lines and lines of two words or fewer:

```ts
const source = record({ …, markdown: post.text, … }, '…— wpis', platform, 'corpus')
source.read_scope = `${post.text.length} chars, whole post from the stored corpus …`
```

Real social posts routinely end in a short call to action or a hashtag line
(e.g. `Read more`, `Learn more`), which `stripBoilerplate` removes. The stored
`source.text` therefore lost those lines, while `read_scope` was overwritten to
claim the whole post — and the grounding gate (`quoteIsVerbatim`) reads back the
*stored* text, so a quote from a dropped line is rejected as not verbatim.

The sibling **attachment** path in the same function already documents the
correct principle — *"Preserve its text verbatim for the existing quote
grounding"* — and builds its source inline without stripping. The social path
was the inconsistent one.

## Fix

Give `record()` a `verbatim` mode that skips `stripBoilerplate` (web boilerplate
does not occur in already-clean corpus text), use it for corpus posts, and make
the `read_scope` claim cap-aware instead of unconditionally saying "whole post":

```ts
const record = (page, kind, channel, origin, verbatim = false) => {
  const cleaned = page.markdown ? (verbatim ? page.markdown : stripBoilerplate(page.markdown)) : null
  …
}
…
const source = record({ …, markdown: post.text, … }, '…— wpis', platform, 'corpus', true)
source.published_at = post.postedAt
if (source.access !== 'unavailable') {
  source.read_scope = source.access === 'partial'
    ? `${source.text!.length} of ${post.text.length} chars, post truncated by the order text cap …`
    : `${post.text.length} chars, whole post from the stored corpus …`
}
```

Web pages keep the default (`verbatim = false`), so their boilerplate stripping
is unchanged, and the order text cap still applies to corpus posts. The existing
fixture posts are single-line prose that `stripBoilerplate` left untouched, so
the full-flow `f07`, `units`, `pipeline` and `materialSources` suites (12 + 12
tests) stay green.

## Proof (red → green)

```bash
# from ai-company/
node node_modules/jest/bin/jest.js --config jest.regression.cjs research-corpus-social
```

- **Before the fix:** the stored corpus source lost the post's trailing
  `Read more` line — `source.text` did not equal the original post text.
- **After the fix:** `source.text` equals the post verbatim and `access` is
  `full`.
