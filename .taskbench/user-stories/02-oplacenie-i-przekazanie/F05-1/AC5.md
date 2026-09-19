---
id: AC5
story: F05-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC5

## Criterion

Nieprzeczytanie potwierdzenia nie wstrzymuje 2.3; odpowiedź klienta jest kierowana do wspólnego G.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/service.ts` — Case activation does not depend on reading a message.

## Missing

- Connect replies to purchase confirmation into G.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
