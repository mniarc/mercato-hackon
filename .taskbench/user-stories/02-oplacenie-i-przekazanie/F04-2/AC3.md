---
id: AC3
story: F04-2
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Dla tego samego opłacenia nie powstaje drugie zamówienie, drugie zlecenie realizacji ani drugi pusty rejestr zmian.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/service.ts` — TC003 proves one order/payment/case after retries.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-003-demo-purchase.spec.ts` — TC003 headed native zero-charge mock_processing purchase proof passed; commit 0893b2fe5. Not live payment or research fulfilment.

## Missing

- Create and deduplicate the required initial WEW-ZMIANY register in the eventual production bootstrap.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
