---
id: AC4
story: F02-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Opcjonalny cel zakupu można pozostawić pusty; jego brak nie jest traktowany jako brak wymaganego pola.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/contracts.ts` — purchaseGoal may be empty; schema does not require substantive optional goal.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
