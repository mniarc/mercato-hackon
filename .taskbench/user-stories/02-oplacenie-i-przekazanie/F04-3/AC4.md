---
id: AC4
story: F04-3
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Sam stan oczekiwania albo odrzucenia płatności nie jest oznaczany jako płatność potwierdzona.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/payment.ts` — Only captured exact transaction is verified; pending/rejected never become paid.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19 at ef3b5390d: the configured fixed offer was purchased; the failed payment remained blocked with no case, retry reused the exact order/payment with a new provider session, pending still had no case, and capture produced the single paid case. Native zero-charge test gateway only; no real payment.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
