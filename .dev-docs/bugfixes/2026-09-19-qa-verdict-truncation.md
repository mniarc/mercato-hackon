# Analysis QA verdict was computed over a truncated finding list

- **Date:** 2026-09-19
- **Branch:** `bugfixes/qa-loops` (from `bugfixes/main`)
- **Area:** `agency_research` analysis QA — `mergeQaVerdict`
- **Regression test:** `ai-company/tests/regression/research-qa-verdict-truncation.test.ts`

## Symptom

An analysis with more than 20 QA findings could be marked **`ready`** even when a
blocking finding existed, letting a faulty document pass 3.7. When it did not
mis-verdict, the repair loop could still fail to route a fix, because the
blocking finding was absent from the stored finding list it reads.

## Root cause

`mergeQaVerdict` (`agency_research/lib/research/steps/qa.ts`) truncated the merged
findings **before** deciding the verdict:

```ts
const findings = [...validator, ...agent.findings].slice(0, 20)
const blocking = findings.filter((f) => f.severity === 'blocking')
```

`validatorFindings` has **no size cap** — it emits one finding per unresolved
citation, empty must-field, over-limit list, unsourced proof card, competitor,
etc. Across four documents it can exceed 20. Because the verdict was read off the
truncated list, a blocking finding past index 20 was ignored → `blocking` empty →
verdict `ready`. And since `runQaLoop` routes repairs off `result.findings.filter
(blocking)`, a blocking finding dropped by the cap also left the loop with no fix
target.

The sibling lanes (`briefQa` / `planQa` / `strategyQa`) cap only the **agent**
findings and keep the deterministic **validator** findings uncapped for the
verdict; `postQa` decides over the full lists. `mergeQaVerdict` was the outlier
that capped the combined list — including the validator's blocking findings —
before deciding.

## Fix

Decide the verdict over **every** finding, and when applying the 20-item storage
cap, keep blocking findings first so the repair loop never loses a fix target:

```ts
const all = [...validator, ...agent.findings]
const blocking = all.filter((f) => f.severity === 'blocking')
// … exception / toFix / verdict computed over `all` …
const findings = [...blocking, ...all.filter((f) => f.severity !== 'blocking')].slice(0, 20)
return qaResultSchema.parse({ verdict, findings, summary: agent.summary })
```

The stored list is still capped at 20; only its ordering changed
(blocking-first). The full-flow analysis-QA suites — `f07`, `f08`,
`qaReclassify`, `pipeline`, `units`, and the brief/material revision runs (53
tests) — stay green.

## Proof (red → green)

```bash
# from ai-company/
node node_modules/jest/bin/jest.js --config jest.regression.cjs research-qa-verdict
```

- **Before the fix:** 20 non-blocking findings followed by one blocking,
  agent-fixable finding produced verdict `ready` and no blocking finding in the
  stored list.
- **After the fix:** verdict `to_fix`, and the blocking finding survives the cap.
