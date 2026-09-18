# T04 E2E contract research — 2026-09-18

## Authoritative scope

- Root narrowed T04 after delegation: customer-portal UI/auth is teammate-owned and is not part of this proof.
- The only substituted boundary is a trusted portal caller invoking T02's module-local intake contract in-process.
- Everything after that boundary must be real: attachment provider/storage and private partition, `agency_cases` persistence, Open Mercato code-defined workflow execution, employee auth/API/backend UI, and navigation to the platform workflow-instance detail.
- No runtime dev/test endpoint and no tone-of-voice behavior.

## Repository-native test location and runner

- Preferred spec: `apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-001-vertical-slice.spec.ts`.
- Export `integrationMeta = { dependsOnModules: ['agency_operations', 'attachments', 'auth', 'customer_accounts', 'customers', 'workflows'] }` so normal discovery can gate the test.
- Shared config: `.ai/qa/tests/playwright.config.ts`; repo default is headless, one worker, one retry, `BASE_URL || http://localhost:3000`, and 20 s base timeout.
- Exact focused command required by T04: `yarn test:integration --grep "agency operations vertical slice"` from `App/ai-company`.
- Exact direct Windows command while iterating: `npx.cmd playwright test --config .ai/qa/tests/playwright.config.ts apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-001-vertical-slice.spec.ts`.
- Discovery check: `npx.cmd playwright test --config .ai/qa/tests/playwright.config.ts --list`.
- The flow spans app bootstrap, provider I/O, workflow execution, and browser navigation, so use `test.slow()` or an explicit timeout instead of relying on the 20 s base timeout.
- `.ai/qa/ephemeral-env.json` was absent during research. The local `om-integration-tests` skill referenced by `.ai/qa/AGENTS.md` is also absent from this checkout; the QA guide and existing executable specs were used directly.

## Canonical target-app bootstrap for the trusted intake caller

- Do not invent an HTTP test endpoint.
- Existing app integration specs use `bootstrapFromAppRoot` from `@open-mercato/shared/lib/bootstrap/dynamicLoader`, followed by `createRequestContainer` from `@open-mercato/shared/lib/di/container`.
- Resolve the app root as:
  `path.resolve(process.env.OM_TEST_APP_ROOT?.trim() || path.resolve(process.cwd(), 'apps/mercato'))`.
- Cache a single bootstrap promise per spec process. `bootstrapFromAppRoot(APP_ROOT)` loads the generated entities, DI registrars, entity IDs, and code-workflow registry for the actual target app. Only after it resolves should the fixture call `createRequestContainer()`.
- T04 should invoke the production T02 intake contract from that real request container. It should not recreate attachment/case/workflow orchestration in the spec.

## Real fixture identities

- Use `getAuthToken(request, 'superadmin')` or admin for fixture administration and `getTokenContext` for tenant and organization IDs.
- Even though portal auth is outside T04, give intake genuine client identities:
  - `createCustomerCompanyFixture` creates a real scoped CRM company.
  - `createCustomerUserFixture` creates a real customer user linked through `customerEntityId`.
- Feed those real IDs to the trusted intake caller; do not use fabricated UUIDs.
- Cleanup helpers are `deleteCustomerUserFixture` then `deleteCustomerCompanyFixture`.

## Real attachment assertions

- T02 should reuse the platform `attachmentService.createScoped` contract, which delegates to `ScopedAttachmentUploadService`; it owns private-partition enforcement, quota reservation, provider storage, attachment persistence, and CRUD side effects.
- The default/private partition is `privateAttachments`; `attachment_partitions.is_public` is the authoritative privacy flag.
- Strongest lean proof is not just the snapshot on `agency_cases`:
  1. query `attachments` joined to `attachment_partitions` by the returned attachment ID and assert `entity_id = 'agency_operations:agency_case'`, `record_id = caseId`, tenant/org scope, file metadata, and `is_public = false`;
  2. GET `/api/attachments/file/{attachmentId}` with a real staff Bearer token and assert status 200, `Cache-Control: private, max-age=60`, and exact sentinel bytes.
- Canonical buffer upload shape, if a later portal-owned browser test is added, is `locator('input[type="file"]').setInputFiles({ name, mimeType, buffer: Buffer.from(...) })` (see WMS `TC-WMS-IMPORT-UI-001`). It is intentionally not part of current T04.

## Real workflow assertions

- Code workflow ID: `agency_operations.process-case`.
- Stable worker ID: `agency_operations.agent-worker.noop.v1`.
- Steps are `start -> agent_worker -> end`; the sync `EXECUTE_FUNCTION` is `agency_operations.processCase` and stores output under `agentWorkerResult`.
- `AgencyCase.workflowInstanceId` is the link; there is no local AgentRun and no duplicate case status column.
- After intake returns, use the platform helper `pollWorkflowInstance(request, token, id, predicate)` or the instance API until `status === 'COMPLETED' && currentStepId === 'end'`.
- Also assert database truth for this exact run: scoped `workflow_instances` row, completed `step_instances` for the worker step, and output/context containing `{ accepted: true }` and the exact case/client/scope/worker identifiers. This proves the deterministic worker actually ran instead of merely checking that an ID was assigned.

## Self-contained employee actor and login

- The shared `login(page, 'employee')` helper is canonical for the initialized default employee, but it relies on the environment's default account and its ACL having been synchronized.
- A more self-contained T04 pattern already used by enterprise specs is:
  1. create a throwaway staff role with `createRoleFixture`;
  2. grant `agency_operations.cases.view` and `workflows.instances.view` with `setRoleAclFeatures`;
  3. create a user in the current organization with `createUserFixture`;
  4. log in through the real `/login` UI: wait for `form[data-auth-ready="1"]`, fill labels `Email` and exact `Password`, press Enter, and assert `/backend`.
- This proves real employee authentication and avoids depending on prior ACL sync. Cleanup is user first, then role.
- If the implementation intentionally uses the default employee instead, call the shared `login(page, 'employee')`; do not duplicate its robust notice/rate-limit handling.

## Employee UI contract from T03

- List: `/backend/agency-operations/cases`.
- Detail: `/backend/agency-operations/cases/{caseId}`.
- Staff API: `GET /api/agency_operations/cases` and detail through `?id={caseId}&pageSize=1`.
- Stable semantic assertions:
  - list heading `Agency cases`;
  - case-title link on the list;
  - detail heading equals the case title;
  - material filename is visible;
  - worker ID `agency_operations.agent-worker.noop.v1` is visible;
  - workflow status renders `Completed`;
  - link `Open workflow run` has exact href `/backend/instances/{workflowInstanceId}`.
- Click that link, assert the URL ends in `/backend/instances/{encoded id}`, and assert the platform workflow page shows `Completed`. This verifies the product link and the platform viewer rather than constructing the detail URL only in test code.

## One focused scenario

1. Bootstrap the actual target app in the Playwright process and create a real request container.
2. Create a real client company and linked customer user with API fixtures.
3. Invoke T02's production intake contract as the trusted portal caller with a unique title and sentinel text buffer.
4. Assert returned case, attachment, workflow instance, and deterministic agent result IDs/data.
5. Read the stored file through the real attachment file route and verify its bytes/private cache policy.
6. Poll the real workflow to `COMPLETED/end` and query the database for scoped case, attachment/private partition, run, step, and worker output truth.
7. Create/login a scoped employee, open the real case list/detail, assert the persisted fields/status, and click `Open workflow run` into the platform workflow detail.
8. Cleanup in `finally`, using only IDs created by this test.

This is one end-to-end test, not a second validation hierarchy. T01/T02/T03 unit/component tests retain their own narrow seam coverage.

## Cleanup order

- Close extra browser contexts first.
- Delete/release the attachment through the real attachment surface (`deleteAttachmentIfExists` is the shared helper) so provider bytes and the row are removed.
- The workflow has no delete API. Follow the existing `TC-EXAMPLE-015-specialized-registries` pattern and delete by the known instance ID in dependency order with `withClient`: `workflow_events`, `user_tasks` if any, `step_instances`, `workflow_branch_instances`, then `workflow_instances`.
- Delete the known `agency_cases` row directly, scoped by `id`, `tenant_id`, and `organization_id`; no runtime case-delete route is intended in this slice.
- Delete customer user then company; delete staff user then role.
- Do not delete/materialize the code workflow definition itself.

## Database helper pattern

- Import `withClient` from `@open-mercato/core/helpers/integration/dbFixtures`.
- Use parameterized queries and exact created IDs. Canonical assertion shape is the same as `TC-NOTIF-013`: return one typed row from `withClient`, then assert outside the callback.
- Avoid totals or shared-database assumptions; every assertion and cleanup must key off this test's IDs and scope.

## Current concrete schema facts

- Case table: `agency_cases`.
- Entity type: `agency_operations:agency_case`.
- Key columns: `id`, `tenant_id`, `organization_id`, `customer_entity_id`, `submitted_by_customer_user_id`, `title`, `agent_worker_id`, `material_attachment_id`, `material_file_name`, `material_mime_type`, `material_file_size`, `workflow_instance_id`, `created_at`, `updated_at`, `deleted_at`.
- No local Agent, Run, or Material tables should be invented.
