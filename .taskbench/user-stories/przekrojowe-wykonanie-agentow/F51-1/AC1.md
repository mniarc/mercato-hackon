---
id: AC1
story: F51-1
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC1

## Criterion

Wykonanie używa wersji STD-LIMITY przypisanej do procesu, z ustalonymi przed uruchomieniem wartościami.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/analysisProcess/contracts.ts` — Explicit phase budgets and selected repair limits are captured before execution.

## Missing

- Complete immutable STD-LIMITY/template policy and recovery-wide accounting are unfinished.

## Decision Required

- T24/T45: approve the specific producer return step, additional guided-attempt allowance and remaining-versus-new budget accounting; no implicit retry authority.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
