---
id: AC1
story: F02-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Przyjęcie warunków zapisuje identyfikator ich wersji oraz czas przyjęcia wraz z danymi zakupu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/nativeSales.ts` — Native order metadata retains termsVersion, offerVersion, originalPurchase and termsAcceptedAt.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-003-demo-purchase.spec.ts` — TC003 headed native zero-charge mock_processing purchase proof passed; commit 0893b2fe5. Not live payment or research fulfilment.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
