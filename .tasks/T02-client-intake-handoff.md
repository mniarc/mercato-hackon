# T02 — Define the client-intake handoff

State: active
Depends on: T01
Owns: `ai-company/apps/mercato/src/modules/agency_operations/lib/contracts/**`, `ai-company/apps/mercato/src/modules/agency_operations/lib/clientMaterialIntakeService.ts`, `ai-company/apps/mercato/src/modules/agency_operations/__tests__/client-intake-contract.test.ts`, `ai-company/apps/mercato/src/modules/agency_operations/di.ts`
Context: Another team member owns customer-portal auth, routes, and UI. Give that
adapter one narrow agency intake contract without implementing or second-guessing
their surface.

## Deliver

- Define the trusted, tenant-scoped input needed to create an agency case from a
  client file and the identity context resolved by the portal adapter.
- Store the file with the real attachment service, persist its ID and small
  metadata snapshot with the case, and route the case into the T01 workflow.
- Pre-generate the case ID and use `attachmentService.createScoped` with owner and
  assignment `agency_operations:agency_case/<caseId>`; create/link the case inside
  `persistLink`, then start the workflow only after that transaction commits.
- Provide a minimal test caller for proof; do not expose it at runtime.

## Done when

- A substituted caller can invoke the contract and produce a real private
  attachment, persisted case, and completed workflow.
- The contract is small enough for the portal owner to adapt without importing
  module internals.
- The focused contract test passes.

## Constraints

- No customer-portal page, route, authentication, or role grants in this slice.
- No public development/test endpoint and no mocked persistence, attachment
  storage, or workflow execution.
- Do not accept tone-of-voice input or implement tone processing; another team
  member owns that domain.

## Handoff

Report the contract, changed files, verification result, and assumptions the
portal owner must satisfy.
