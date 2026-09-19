---
id: AC3
story: F05-1
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Historia powiadomienia pokazuje rzeczywisty wynik wysłania; błędu doręczenia nie przedstawia jako sukcesu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/service.ts` — No purchase-notification delivery record implemented.

## Missing

- Record actual delivery result and technical failure.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
