---
id: AC3
story: F02-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Klient może poprawić dane przed przekazaniem ich do 1.4; zapisane WEW-DANE-ZAMOWIENIA odpowiadają wartościom po walidacji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/nativeSales.ts` — Editable pre-submit form sends validated originalPurchase into immutable order metadata.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-003-demo-purchase.spec.ts` — TC003 headed native zero-charge mock_processing purchase proof passed; commit 0893b2fe5. Not live payment or research fulfilment.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
