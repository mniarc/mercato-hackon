# T04 — Prove the real vertical slice

State: ready
Depends on: T02, T03
Owns: `ai-company/apps/mercato/src/modules/agency_operations/__integration__/**`
Context: Integrate the two portals through the actual Open Mercato app. This is
the evidence task, not another validation framework.

## Deliver
- Add one happy-path browser scenario: client login/upload -> saved private
  attachment and case -> deterministic agent run -> completed workflow -> client
  status -> employee case detail.
- Cover cross-client record denial in the same focused suite if not already
  proven at the API boundary.

## Done when
- The scenario passes against the running app and database with no mocked
  frontend, API, persistence, attachment, auth, or workflow layer.
- `yarn test:integration --grep "agency operations vertical slice"` passes.

## Constraints
- A fixed no-op agent result is the only permitted fake.
- Fix product code where the end-to-end seam fails; do not mask it in the test.

## Handoff
Report changed files, the command result, and the next smallest gap discovered.
