---
id: AC4
story: F48-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Rutynowe oczekiwanie na akceptację lub odpowiedź klienta nie jest samo w sobie eskalacją do pracownika.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/strategyExecution/reviewHandoff.ts` — Routine unready/configuration holds remain waiting without inventing employee exceptions; actual saved escalation uses separate E.1.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | unknown |
| Live Model | not_run |
