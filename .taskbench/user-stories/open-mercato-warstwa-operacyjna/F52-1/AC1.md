---
id: AC1
story: F52-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Sprawa wskazuje klienta, kupiony produkt, zamówienie i instancję ustalonego STD-PROCES.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/activate.ts` — Confirmed test order activation links one customer/product/order/case and native workflow.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | passed |
| Live Model | not_run |
