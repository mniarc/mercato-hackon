---
id: AC5
story: F56-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC5

## Criterion

Widok początku pokazuje jednego klienta, produkt i sprawę realizacji w OM.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/activate.ts` — Headed purchase proves one customer/product/order/case and native awaiting-execution process.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
