---
id: AC4
story: F05-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Uruchomienie nie wymaga odczytu maila 2.2, dodatkowego działania klienta lub rutynowej akceptacji pracownika.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/activate.ts` — Verified demo capture creates case without notification read or routine staff approval.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-003-demo-purchase.spec.ts` — TC003 headed native zero-charge mock_processing purchase proof passed; commit 0893b2fe5. Not live payment or research fulfilment.
- `ai-company/apps/mercato/src/modules/agency_operations/lib/paidCaseAnalysis/__tests__/bootstrap.test.ts` — Focused call-chain checks start from verified paid state without mail read, another client action or routine staff acceptance.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | passed |
| Live Model | not_run |
