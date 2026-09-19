---
id: AC4
story: F02-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Potwierdzenie danych i warunków nie jest akceptacją briefu, strategii ani przyszłych rezultatów.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/demoOffer.ts` — Purchase terms create no document acceptance; demo explicitly does not authorize paid agent work or publication.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-003-demo-purchase.spec.ts` — TC003 headed native zero-charge mock_processing purchase proof passed; commit 0893b2fe5. Not live payment or research fulfilment.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
