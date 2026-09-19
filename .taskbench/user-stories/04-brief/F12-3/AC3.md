---
id: AC3
story: F12-3
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Nieaktualna lub pozbawiona ważnej akceptacji wersja briefu nie daje gotowości etapu strategii.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/strategyReadiness/resolve.ts` — Missing acceptance, stale inputs, failed/mismatched QA or simulation cannot be ready.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
