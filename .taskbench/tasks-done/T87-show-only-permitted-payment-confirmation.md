# T87 — Keep unavailable payment actions out of the customer flow

State: done
Sources: F03-2 AC3–4, F04-1 AC5; bounded follow-up to T65/T60.

Verification: existing service and status-component suites passed, 25 checks.
No new headed journey; TC003 remains the separate failed-payment retry proof.

The zero-charge purchase flow currently labels cancelled and other nonconfirmable
native states `blocked`, then offers confirmation that the gateway must reject.
Expose explicit server confirmation eligibility and use it in the existing status
component. Preserve the provider state/reason, failed-session same-order retry,
refresh, and verified captured-payment activation recovery. An ineligible confirm
request returns its actual receipt without invoking the simulator or starting work.

Own only purchase receipt/confirm guard, additive receipt schema, the existing
status-button condition and focused tests. No copy/style changes, new payment
policy, cancelled-session reactivation, new journey or real payment call.

Done when focused checks show cancelled/ineligible states have no confirm action
or side effects, while pending confirmation and captured activation recovery remain
available. TC003 already owns failed payment retry; do not duplicate its journey.
