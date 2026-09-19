---
id: AC3
story: F04-3
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Wyjątek widoczny w OM ma właściciela i jest powiązany z właściwym zamówieniem.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/payment.ts` — Purchase mismatch currently has no assigned employee task.

## Missing

- Expose ownership and correct order binding for payment exception.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
