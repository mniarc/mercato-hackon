# T65 - Retry a failed demo payment on the same order

State: active (gateway/service partial; portal integration and retry proof outstanding)
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

Done when focused gateway/service/route checks pass and the coordinator extends
the existing zero-charge TC003 journey with failed-payment retry and one-case
activation. Worker runs no shared tests, runtime, builds or Git; connected proof
is deferred until the current T58 runtime work finishes.
