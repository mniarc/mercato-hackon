---
id: AC5
story: F52-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC5

## Criterion

Widok prezentuje rzeczywiście zapisane wykonania; funkcjonalność agencji jest częścią budowanego modułu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/processProjection/query.ts` — Employee view reads persisted scoped WorkflowInstance/UserTask/research records, not a shadow success model.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
