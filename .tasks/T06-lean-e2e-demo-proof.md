# T06 — Lean E2E and demo proof

State: active
Depends on: T04 for the shared passing runtime result
Owns: `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-001-vertical-slice.spec.ts`

## Outcome

Keep one reliable Playwright journey that proves the unique user-visible seam:
trusted intake reaches real Open Mercato persistence/workflow and an authorized
employee can see the case and retrieve its material. Remove assertions that
only repeat focused service, authorization, schema, event, or workflow tests.

## Constraints

- Do not add another Playwright path or testing framework.
- Fixture creation and cleanup may use internals; they are setup, not proof.
- Preserve evidence that auth, API/UI, attachment access, persistence, and the
  workflow transition are real rather than mocked.
- Use the persistent development app/database from T08. A disposable production
  proof is exceptional, not an extra acceptance gate for every merge.

## Done when

- The spec asserts only the cross-surface behavior not better owned elsewhere.
- Focused tests retain lower-level coverage removed from Playwright.
- The single filtered spec passes against the persistent development environment and
  remains suitable as the demo smoke path.

## Remaining proof

Assertion reduction is implemented in `d140a7054`: one journey covers intake,
workflow completion, employee case visibility, and material bytes. Focused
workflow/intake/access coverage remains; the delivery handoff reported five
suites and 20 passing tests. No more assertion refactor is queued. Await the
same passing T04 scenario; its login-readiness failure is not grounds for
another harness or validation layer.
