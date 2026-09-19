---
id: AC1
story: F04-3
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Niezgodna kwota, waluta, zamówienie lub stan nie daje potwierdzenia uprawniającego do uruchomienia realizacji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/payment.ts` — Mismatched payment/order/currency/amount returns blocked and cannot activate case.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
