---
id: AC5
story: F60-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC5

## Criterion

Konkretne wartości limitów i roboczych parametrów produktu wymagają decyzji agencji przed ich użyciem; funkcjonalność nie narzuca panelu konfiguracyjnego.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/analysisProcess/contracts.ts` — Initial phase execution requires explicit positive budgets/product topic count; disabled/missing policy blocks. Demo-only commercial values are separately approved, not inferred.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
