# T03 — Show agency work to a real employee

State: active
Depends on: T01
Owns: `ai-company/apps/mercato/src/modules/agency_operations/api/cases/**`, `ai-company/apps/mercato/src/modules/agency_operations/backend/**`, `ai-company/apps/mercato/src/modules/agency_operations/__tests__/employee-case-view.test.tsx`
Context: The standard Open Mercato `/backend` is the employee portal. Employees
observe routine agent work and handle later exceptions; they do not approve every run.

## Deliver
- Add staff-authenticated case list/detail routes and backend pages.
- Show client reference, material metadata, assigned agent worker, saved run
  input/output, state, and linked workflow instance.

## Done when
- An authorized employee can inspect the persisted result of the T01 workflow.
- The UI is backed by the real module API and database, not fixture data.
- `yarn workspace @open-mercato/app test --runInBand apps/mercato/src/modules/agency_operations/__tests__/employee-case-view.test.tsx` passes.

## Constraints
- Use Open Mercato staff auth, ACL, navigation, and UI extension conventions.
- Do not add approvals, exception queues, or LLM controls in this task.
- Do not add tone-of-voice fields, configuration, or UI; that belongs to another
  team member.
- Keep the employee feature self-contained under the module backend directory;
  route files should stay thin and domain code must not import UI code.
- Consume agency use cases and the workflow bridge rather than reaching from UI
  into another module's internals.

## Remaining proof

The staff case API, list/detail pages, workflow evidence view, and scoped material
download are implemented (`7235d4130`, `f6aa62636`); focused UI/API/access tests
passed in the delivery handoff. T04 is the single remaining runtime proof:
employee login, case display, and material download. The latest headed run stopped
at login readiness before reaching these pages. Do not create a second UI journey
or rebuild this feature because its task was previously left active.
