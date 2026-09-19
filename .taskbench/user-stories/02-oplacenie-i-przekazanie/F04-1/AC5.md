---
id: AC5
story: F04-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC5

## Criterion

Stany oczekujący i odrzucony są widoczne bez rozpoczęcia usługi.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/payment.ts` — Portal receipt distinguishes pending/blocked/captured and does not start service for pending or rejected states.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19 at ef3b5390d: the configured fixed offer was purchased; the failed payment remained blocked with no case, retry reused the exact order/payment with a new provider session, pending still had no case, and capture produced the single paid case. Native zero-charge test gateway only; no real payment.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
