---
id: AC2
story: F05-1
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Wiadomość nie prosi o dokumenty ani o akceptację dalszych materiałów.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/service.ts` — No purchase-confirmation sender implemented.

## Missing

- Use a confirmation message that does not request documents or later acceptance.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
