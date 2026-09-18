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
- `yarn test:agency` (or `yarn test:agency:headed`) passes against the persistent
  app; see the [testing process](../.dev-docs/.processes/current/testing.md).

## Constraints
- A minimal trusted portal caller and fixed no-op agent result are the only
  permitted substitutes.
- Do not add a runtime dev/test endpoint or any tone-of-voice behavior.
- Fix product code where the end-to-end seam fails; do not mask it in the test.

## Remaining proof

The single scenario exists and now has lean assertions and phase logging
(`d140a7054`, T06/T07). The current persistent-runtime headed run reached real
fixture creation, private intake, and completed workflow; it failed waiting for
`form[data-auth-ready="1"]` during employee login. A warm login-page probe also
failed readiness; the cause is not established. Fix that seam, then finish case
display and material retrieval on the same app/database. No full-demo pass is
claimed. This one result also closes T03 and T06 runtime acceptance; do not add
duplicate browser scenarios.
