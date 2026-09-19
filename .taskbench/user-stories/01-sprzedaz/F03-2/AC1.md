---
id: AC1
story: F03-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Ponowienie nieudanej płatności zachowuje identyfikator zamówienia, produkt, przypisaną cenę, walutę i wersję katalogu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/payment.ts` — Failed-session retry creates only a native gateway attempt for the existing order/payment; product and pinned catalogue metadata are not rewritten.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-003-demo-purchase.spec.ts` — Headed TC003 passed 2026-09-19, commit eb2eef065: real failed webhook and portal retry retain order ID, 2,500 PLN and payment ID. Product/catalogue-version persistence is source-grounded, not separately asserted in this journey.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19 at ef3b5390d: the configured fixed offer was purchased; the failed payment remained blocked with no case, retry reused the exact order/payment with a new provider session, pending still had no case, and capture produced the single paid case. Native zero-charge test gateway only; no real payment.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | passed |
| Live Model | not_run |
