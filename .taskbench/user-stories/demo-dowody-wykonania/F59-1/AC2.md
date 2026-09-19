---
id: AC2
story: F59-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Karta bieżącego wykonania pozostaje dostępna z rzeczywistym stanem, blokadą lub wyjątkiem.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/processProjection/query.ts` — Current workflow record stays available with persisted status/error/exception evidence.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
