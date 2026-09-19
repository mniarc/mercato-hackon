# T65 - Retry a failed demo payment on the same order

State: done (bounded zero-charge demo; commit `eb2eef065`)
Sources: F03-2 AC1-4; T60 recovery; follow-up to completed bounded T25
Owns: `agency_operations/lib/orderBootstrap/**`, purchase-only agency portal/API,
the order page callback and necessary agency locale keys

Use native gateway session creation/idempotency to retry an explicitly failed,
uncaptured demo session. Keep the original order, payment, fixed 2,500 PLN offer,
terms and failed transaction history. Pin each retry to the failed provider
session so replay cannot create another attempt. Keep customer/tenant ownership,
mutation guards and native amount-due reconciliation. No live charges, new DB
schema, payment framework or changes to G/research execution.

Expose the actual retryable state and action in the existing purchase portal.
A retry only becomes pending; only verified native capture can activate one case.
Wrong-owner, mismatched, captured/refunded or nonfailed attempts cannot create a
new session. Refresh and confirmation recovery keep their existing behavior.

Proof: 21 focused payment/service/route checks and app typecheck passed. The
existing headed TC003 passed on 2026-09-19: signed native failed webhook -> real
portal retry -> native capture, retaining the same 2,500 PLN order/payment and
failed-attempt history, then exactly one case awaiting execution. Owned fixture
cleanup completed; no real charge or paid model call. New-signup onboarding is
not covered by this proof and remains T69.
