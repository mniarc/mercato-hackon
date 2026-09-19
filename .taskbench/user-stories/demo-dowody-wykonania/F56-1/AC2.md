---
id: AC2
story: F56-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Historia pokazuje czas i stan wcześniejszego wykonania; nie jest przedstawiana jako generowanie na żywo.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/processProjection/query.ts` — Persisted run timestamps/statuses are visible.

## Missing

- No finalized demo script differentiating the actual prepared dataset from live generation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
