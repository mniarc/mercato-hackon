# T92 — Dispatch purchase confirmation independently of fulfilment

State: active
Sources: F04-1 AC3; F05-1 AC1–5.

Implemented in source; 2 focused suites / 28 tests passed, followed by 23 passing
checks for the sending-state fix and app typecheck. Native joined delivery proof
remains, so the task and stories are not marked complete.

After a verified agency purchase capture, send the scoped customer a native
system-email confirmation containing only the saved order number, purchased
package and preparation-start statement. Persist the truthful delivery outcome
against the original purchase binding and make capture replay idempotent.

Delivery failure or unavailable email configuration must remain explicit and
must not repeat or block case activation, paid-case preparation or payment.
Use the existing Communications Hub email transport; add no provider calls in
tests, second queue, fabricated commercial terms or customer decisions.
