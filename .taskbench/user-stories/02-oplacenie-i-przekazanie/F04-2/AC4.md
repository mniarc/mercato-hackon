---
id: AC4
story: F04-2
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC4

## Criterion

W sprawie OM pozostaje jedno powiązanie opłaconego zamówienia z instancją STD-PROCES.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/activate.ts` — One case links to one native demo WAIT workflow.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-003-demo-purchase.spec.ts` — TC003 headed native zero-charge mock_processing purchase proof passed; commit 0893b2fe5. Not live payment or research fulfilment.

## Missing

- Bind the actual STD-PROCES fulfilment definition rather than demo awaiting-execution only.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
