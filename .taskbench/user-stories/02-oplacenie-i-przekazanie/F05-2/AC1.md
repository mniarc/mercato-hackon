---
id: AC1
story: F05-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Powstaje sprawa realizacji powiązana z potwierdzoną płatnością, danymi klienta i kupionym produktem.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/activate.ts` — Verified native test capture creates scoped case with private original purchase attachment and product/customer binding.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-003-demo-purchase.spec.ts` — TC003 headed native zero-charge mock_processing purchase proof passed; commit 0893b2fe5. Not live payment or research fulfilment.
- `ai-company/apps/mercato/src/modules/agency_operations/lib/paidCaseAnalysis/bootstrap.ts` — Verified capture is reloaded against the same paid case, customer, product and original private purchase attachment before native analysis can start.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | passed |
| Live Model | not_run |
