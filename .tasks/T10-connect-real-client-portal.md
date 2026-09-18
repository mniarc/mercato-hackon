# T10 - Connect the teammate portal to agency work

State: active
Depends on: T02
Owns: `ai-company/apps/mercato/src/modules/agency/**`, portal-facing integration tests
Context: Use the teammate frontend as the real entry point; keep the substituted caller only as a focused contract test.

## Deliver
- Reconcile the latest frontend branch before adding missing integration.
- Connect authenticated client submission to existing agency/platform contracts without duplicating portal auth, orders, or payment logic.

## Done when
- A real portal submission produces persisted agency work and the demo uses that entry point.

## Constraints
- Confirm the order/material handoff from existing contracts; do not invent paid events or silently equate an order with a material upload.
- No database resets or duplicate frontend implementation.
