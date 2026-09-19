---
id: AC2
story: F04-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Po poprawnej weryfikacji zapisuje potwierdzenie przy właściwym zamówieniu wraz z identyfikatorem transakcji i dowodem operatora.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/payment.ts` — Native GatewayTransaction stores captured provider session and transaction evidence before activation.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-003-demo-purchase.spec.ts` — TC003 headed native zero-charge mock_processing purchase proof passed; commit 0893b2fe5. Not live payment or research fulfilment.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
