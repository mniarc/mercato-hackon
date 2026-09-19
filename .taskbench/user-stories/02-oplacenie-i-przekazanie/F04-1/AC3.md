---
id: AC3
story: F04-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Potwierdzona płatność udostępnia niezależnie uruchomienie potwierdzenia klientowi w 2.2 i przygotowania realizacji w 2.3.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/payment.ts` — Verified capture activates one case; no independent purchase-confirmation delivery branch exists.

## Missing

- Add independent 2.2 notification without coupling 2.3 to delivery.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
