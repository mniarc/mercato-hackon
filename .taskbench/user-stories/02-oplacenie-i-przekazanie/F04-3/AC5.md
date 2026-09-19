---
id: AC5
story: F04-3
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC5

## Criterion

Obsługa wyjątku nie tworzy nowego zakupu ani nie omija warunku potwierdzonego opłacenia.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/payment.ts` — Blocked purchase paths do not create a second purchase or bypass capture.

## Missing

- Complete employee exception handling without circumventing verified payment.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
