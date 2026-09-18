# T02 — Let a real client submit material

State: ready
Depends on: T01
Owns: `ai-company/apps/mercato/src/modules/agency_operations/api/portal/**`, `ai-company/apps/mercato/src/modules/agency_operations/frontend/[orgSlug]/portal/agency/**`, `ai-company/apps/mercato/src/modules/agency_operations/__tests__/portal-scope.test.ts`
Context: Add the first client-portal surface on the T01 service. F40, F41, and
F55 are context, not an exhaustive contract.

## Deliver
- Add a real client portal page and module-owned upload endpoint.
- Resolve customer auth/RBAC and derive tenant, organization, customer, and
  contact from the portal JWT.
- Store the file through `attachmentService` in a private partition, create the
  material/case, and start the T01 workflow.

## Done when
- A linked client can upload and see their saved material and current status.
- Another or unlinked client cannot read or submit against that record.
- `yarn workspace @open-mercato/app test --runInBand apps/mercato/src/modules/agency_operations/__tests__/portal-scope.test.ts` passes.

## Constraints
- Never accept tenant, organization, customer, or contact IDs from the request.
- Do not use the staff-only generic attachments endpoint or mocked storage/API.

## Handoff
Report changed files, verification result, and any auth/attachment assumption.
