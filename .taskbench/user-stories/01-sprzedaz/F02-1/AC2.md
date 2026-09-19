---
id: AC2
story: F02-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Brak wymaganego adresu WWW lub innego wymaganego pola wskazuje pole do uzupełnienia i nie nadaje gotowości zakupu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/contracts.ts` — Required website and mandatory billing/contact fields are server-validated; invalid-input runtime not separately demonstrated.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
