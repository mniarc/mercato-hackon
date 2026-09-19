---
id: AC1
story: F05-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC1

## Criterion

Potwierdzenie po 2.1 zawiera numer zamówienia, kupiony pakiet i informację o rozpoczęciu przygotowania usługi.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/service.ts` — Portal displays order/payment receipt and case link, but this is not a 2.2 customer notification.

## Missing

- Deliver explicit purchase/package/start confirmation through chosen channel.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
