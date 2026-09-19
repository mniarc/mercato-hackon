---
id: AC3
story: F44-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Nieaktualne zależności nie mogą uruchomić dalszego wykonania ani publikacji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/strategyExecution/run.ts` — Phase entry readiness rejects stale accepted foundations.

## Missing

- No full impact-driven invalidation or pending publication hold.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
