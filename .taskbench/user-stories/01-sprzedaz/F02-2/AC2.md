---
id: AC2
story: F02-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Brak potwierdzenia stałych warunków nie daje gotowości do utworzenia zamówienia w 1.4.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/contracts.ts` — acceptedTerms is literal true; missing consent cannot pass purchase schema.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
