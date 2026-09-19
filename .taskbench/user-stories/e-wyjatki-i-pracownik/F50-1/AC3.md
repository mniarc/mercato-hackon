---
id: AC3
story: F50-1
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Powtórzone przetworzenie tego samego rozstrzygnięcia nie uruchamia zadania po raz drugi.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/strategyExecution/claim.ts` — Initial phase claims safely replay saved results; they do not execute a new resolution-bound recovery.

## Missing

- No once-only recovery claim keyed to a persisted employee decision.

## Decision Required

- T24/T45: approve the specific producer return step, additional guided-attempt allowance and remaining-versus-new budget accounting; no implicit retry authority.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
