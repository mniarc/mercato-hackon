---
id: AC2
story: F11-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Agent korzysta z oryginalnego materiału i pochodzenia w WEW-ZGLOSZENIE, istniejących źródeł oraz mapy ustaleń.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/materialRevision/source.ts` — The native private attachment is resolved with original submission provenance and the current unapproved brief version.
- `ai-company/apps/mercato/src/modules/agency_research/lib/materialRevision/run.ts` — The revision loads the existing source register, findings, audit, competitors, order and pinned brief inputs before any targeted change.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | not_run |
| Live Model | not_run |
