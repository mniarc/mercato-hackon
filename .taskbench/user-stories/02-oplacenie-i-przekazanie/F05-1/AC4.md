---
id: AC4
story: F05-1
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Błąd doręczenia jest obsługiwany technicznie bez powtórzenia zakupu lub realizacji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/service.ts` — No purchase-notification retry path implemented.

## Missing

- Retry delivery independently of purchase/fulfilment.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
