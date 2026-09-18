# T04 — Prove the real vertical slice

State: active
Depends on: T02, T03
Owns: `ai-company/apps/mercato/src/modules/agency_operations/__integration__/**`
Context: Prove our owned slice through the actual Open Mercato app. The customer
portal is teammate-owned, so substitute only its caller boundary. This is the
evidence task, not another validation framework.

## Deliver
- Use a test fixture as the trusted portal caller to create a real private
  attachment and invoke intake, then prove case persistence, deterministic agent
  execution, completed workflow, and employee case detail in the browser.

## Done when
- The scenario passes against the running app and database. Only the absent
  customer-portal caller and content-neutral worker intelligence are substituted;
  employee frontend/API/auth, persistence, attachment storage, and workflow are
  real.
- `yarn test:integration --grep "agency operations vertical slice"` passes.

## Constraints
- A minimal trusted portal caller and fixed no-op agent result are the only
  permitted substitutes.
- Do not add a runtime dev/test endpoint or any tone-of-voice behavior.
- Fix product code where the end-to-end seam fails; do not mask it in the test.

## Handoff
Report changed files, the command result, and the next smallest gap discovered.
