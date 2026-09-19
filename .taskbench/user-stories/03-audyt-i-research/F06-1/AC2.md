---
id: AC2
story: F06-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC2

## Criterion

W OM każde aktywne zadanie ma wskazany dział, agenta, stan i zależności.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/analysisProcess/activity.ts` — Native workflow/agent/task runs and employee ledger expose state and versions.

## Missing

- Confirm department ownership and dependency presentation for each active research subtask, not only workflow/agent identity.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
