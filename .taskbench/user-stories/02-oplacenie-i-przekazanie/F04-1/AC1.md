---
id: AC1
story: F04-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

System sprawdza autentyczność zdarzenia dostawcy oraz zgodność identyfikatora zamówienia, kwoty i waluty.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/payment.ts` — Signed mock provider webhook plus matchesDemoPayment verify order/payment, exact amount/currency and scope.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-003-demo-purchase.spec.ts` — TC003 headed native zero-charge mock_processing purchase proof passed; commit 0893b2fe5. Not live payment or research fulfilment.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
