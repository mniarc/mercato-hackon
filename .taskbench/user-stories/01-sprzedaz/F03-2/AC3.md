---
id: AC3
story: F03-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Status płatności widoczny w OM odpowiada wynikowi dostawcy, a nie samemu rozpoczęciu kolejnej próby.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/service.ts` — Receipt status is derived from the persisted native provider transaction.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-003-demo-purchase.spec.ts` — Headed TC003 passed 2026-09-19: portal shows blocked/retryable after verified failure, pending after retry, and paid only after native capture; final DB check retains both actual outcomes.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | passed |
| Live Model | not_run |
