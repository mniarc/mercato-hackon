# Agency slice compliance audit — 2026-09-18

Read-only audit of the current `agency_operations` module after the T01–T03/T02
integration and initial migration. Sources included the applicable repository,
core, workflows, attachments, CLI, customers-reference, UI, and backend-UI agent
guides; the synthesized agency/employee reuse notes; F52-1, F54-1, and F55-1;
and the current module, migration, snapshot, generated discovery output, and
focused tests.

## Verdict

The selected architecture is lean and substantially correct: one agency-owned
table, scalar cross-module IDs, platform-owned attachments, a real code-defined
workflow, a content-neutral worker, and a self-contained employee UI. The
migration is limited to `agency_cases`, and the module contains no customer
portal or tone-of-voice implementation.

Do not call the vertical slice proven yet. The blockers below must be resolved
or, where explicitly noted, closed by T04 evidence.

## Blockers

### High — the current focused tests do not prove real persistence or execution

- `apps/mercato/src/modules/agency_operations/__tests__/workflow.test.ts:104-118`
  replaces both the `EntityManager` and `workflowExecutor`, then returns a
  fabricated completed execution at lines 108-110.
- `apps/mercato/src/modules/agency_operations/__tests__/client-intake-contract.test.ts:67-132`
  replaces the attachment service, transaction, and workflow service.
- This conflicts with the real-integration acceptance wording in
  `.tasks/T01-real-agency-workflow-spine.md` and
  `.tasks/T02-client-intake-handoff.md`. These tests are useful wiring tests but
  cannot establish attachment storage, a committed `agency_cases` row,
  code-workflow discovery, `EXECUTE_FUNCTION`, or durable workflow evidence.

Required closure: T04 must bootstrap the actual app, resolve the production DI
service, use real PostgreSQL and attachment storage, reload the case, attachment,
workflow instance, step instances, events, and `context.agentWorkerResult`, then
exercise the authenticated employee UI. Do not cite the mock-based tests as that
proof.

### High — an alternate service path bypasses attachment ownership

- `apps/mercato/src/modules/agency_operations/lib/agencyCaseWorkflowService.ts:108-113`
  publicly exposes `createAndProcessCase`.
- Its implementation at lines 155-174 and 241-243 creates an `AgencyCase` from
  any caller-supplied `materialAttachmentId` and metadata without invoking
  `attachmentService.createScoped`, checking the owner/assignment, or proving
  that the attachment exists in the same scope.
- The production intake path does not use this method. Its only visible purpose
  is the earlier workflow-spine construction path, so retaining it creates a
  second, weaker creation boundary contrary to the one trusted intake seam.

Required fix: remove `createAndProcessCase`, its input schema/type, and the
private `createCase` helper unless a real caller is identified and routed through
the attachment ownership contract. Keep `processCase` as the one workflow bridge
for an already persisted, attachment-backed case.

### High — employee material bytes are not protected by the agency-case ACL or owner

- `apps/mercato/src/modules/agency_operations/backend/agency-operations/cases/_lib/attachmentBridge.ts:1-3`
  links directly to `/api/attachments/file/:attachmentId`.
- The platform route
  `packages/core/src/modules/attachments/api/file/[id]/route.ts:20-21,35-70`
  checks authentication, attachment tenant/organization, and partition policy,
  but it does not require `agency_operations.cases.view` and does not verify the
  expected owner or assignment.
- Consequently, a same-scope authenticated principal who obtains an attachment
  UUID can address client material directly even when the agency case page/API
  is unavailable to that principal. Page navigation guards do not protect that
  direct URL. This is the direct-ID class F55-1 requires the module to close.

Required fix: add a small employee material GET under the agency module. Guard it
with `agency_operations.cases.view`, load the case by ID plus tenant,
organization, and `deletedAt: null`, then call the public
`attachmentService.readScoped` contract with the exact expected owner,
assignment, `privateAttachments` partition, and `requirePrivatePartition: true`.
Export OpenAPI and make the employee UI use that URL. The teammate-owned portal
adapter needs its own customer-ownership check and must likewise not expose the
generic file URL.

### Medium — the detail page's declared permission is weaker than its runtime dependencies

- `apps/mercato/src/modules/agency_operations/backend/agency-operations/cases/[id]/page.meta.ts:1-4`
  admits a user with only `agency_operations.cases.view`.
- `apps/mercato/src/modules/agency_operations/backend/agency-operations/cases/_lib/caseViewModel.ts:124-133`
  always calls workflow instance and step APIs, both of which require
  `workflows.instances.view`.
- Default employees currently receive both features, but a custom role granted
  only the advertised agency feature passes page routing and then gets a
  guaranteed load error.

Required fix: require `workflows.instances.view` on the detail page (and encode
the dependency in the agency view feature if that is the intended role-grant
contract), or make workflow evidence an explicitly optional section. Test the
chosen ACL contract with a non-default role.

## Later improvements

### Medium — agency writes bypass the platform command/side-effect contract

- `apps/mercato/src/modules/agency_operations/lib/clientMaterialIntakeService.ts:43-60`
  persists the case directly inside `persistLink`.
- `apps/mercato/src/modules/agency_operations/lib/agencyCaseWorkflowService.ts:218-220`
  writes `workflowInstanceId` directly and flushes.
- The core module rules require domain writes through commands so audit, events,
  undo where applicable, indexing, and cache side effects remain coherent. The
  current read route declares an indexer, but no case-create/update side effects
  are emitted.

Keep the lean attachment transaction, but before treating this as a
production-grade module, introduce the smallest command/use-case boundary that
can participate in `persistLink` and record the workflow association without
duplicating the attachment service's transaction or side effects.

### Medium — the persisted material snapshot is declared metadata, not canonical metadata

- `apps/mercato/src/modules/agency_operations/lib/clientMaterialIntakeService.ts:52-55`
  stores the caller's filename, declared MIME type, and buffer length.
- The attachment platform sanitizes the filename and detects the MIME type before
  returning canonical `fileName`, `mimeType`, and `fileSize` from
  `createScoped`. The case snapshot can therefore disagree with the attachment
  actually stored, and that declared MIME value is also copied into workflow
  evidence.

Either name these fields as declared metadata or update the case from the
canonical `createScoped` result through the case-write boundary. Never query
attachment entities directly from this module.

### Medium — workflow start is not concurrency-idempotent

- `apps/mercato/src/modules/agency_operations/lib/agencyCaseWorkflowService.ts:194-220`
  implements check-then-start with no lock or uniqueness guard.
- Two concurrent retries can both observe `workflowInstanceId === null`, start
  two workflow instances with the same correlation key, and race to store one
  ID on the case.

This is acceptable for a single-call demo fixture but should be closed before
portal retries or queued intake are enabled, using a scoped lock/atomic claim or
another platform-supported idempotency mechanism.

### Low — staff privileges and DTOs are broader than the implemented slice

- `apps/mercato/src/modules/agency_operations/setup.ts:7` grants
  `agency_operations.cases.manage` to every default employee although no manage
  operation exists. Keep it admin-only or add it when the first real mutation
  ships, so a future manage route is not silently opened to all employees.
- `apps/mercato/src/modules/agency_operations/api/cases/route.ts:34-49,60-75`
  returns tenant, organization, and submitter IDs even though the current list
  and detail UI do not need the scope IDs. A narrower staff DTO reduces needless
  identity exposure.

### Low — the UI bridge embeds workflow implementation literals

- `apps/mercato/src/modules/agency_operations/backend/agency-operations/cases/_lib/caseViewModel.ts:135-140`
  hard-codes `agent_worker` and `agentWorkerResult`.
- The adapter is correctly localized to one module-owned file, so this is not
  spaghetti today. Reuse a module-owned evidence contract/constant before a
  second consumer appears or the workflow layout becomes swappable.

## Confirmed compliant points

- **Public boundaries:** workflow definition imports use
  `@open-mercato/shared/modules/workflows`; runtime execution resolves
  `workflowExecutor`; attachment creation resolves the public
  `AttachmentService` type/DI contract. No peer ORM entity is imported.
- **Scope:** `AgencyCase` has required tenant and organization columns; the case
  API delegates tenant, organization, and soft-delete predicates to
  `makeCrudRoute`; workflow case loads include case, tenant, organization,
  customer, and deletion scope; platform workflow reads are independently
  tenant/organization scoped.
- **Attachment creation:** `createScoped` receives both scope IDs, the private
  partition, exact owner/record, and matching assignment. The case link is
  persisted inside `persistLink`, so storage/attachment/case creation share the
  platform transaction.
- **DI lifetimes:** the two request services are scoped; the deterministic worker
  is a stateless value. This does not pin a request `EntityManager` in a
  singleton.
- **Workflow truth:** the code-defined `START -> AUTOMATED -> END` flow uses the
  real built-in `EXECUTE_FUNCTION` activity. Its transition output is correctly
  expected at `WorkflowInstance.context.agentWorkerResult`; step/events are
  lifecycle evidence rather than falsely claimed payload storage. The worker is
  an explicit no-op and makes no model/network call.
- **API:** the case surface is GET-only, feature guarded, scoped, page-size
  capped, indexed through the CRUD contract, and exports OpenAPI. No unguarded
  write route was added.
- **UI and i18n:** employee frontend code is self-contained under the module's
  backend capability directory, calls public APIs through `apiCall`, uses shared
  Open Mercato components, has dedicated loading/not-found/error states, and has
  the same 42 keys in all currently supported module locales (`en`, `pl`, `de`,
  `es`, `ko`).
- **Migration:**
  `apps/mercato/src/modules/agency_operations/migrations/Migration20260918182100_agency_operations.ts`
  and `.snapshot-open-mercato.json` contain only `agency_cases`, its scalar
  columns, and three scoped indexes. There are no duplicate client, material,
  agent, run, or task tables and no cross-module foreign-key/ORM relationships.
- **Ownership exclusions:** there is no `frontend/` customer-portal tree, portal
  route/auth/RBAC grant, tone profile, prompt, rule, field, or tone-processing
  behavior in the module. The only portal artifact is the narrow server-side
  intake contract intended for the teammate-owned adapter.
- **Bridge shape:** workflow orchestration is isolated in
  `agencyCaseWorkflowService`; attachment creation is isolated in
  `clientMaterialIntakeService`; employee cross-domain HTTP composition is
  isolated in `caseViewModel`; route/page files stay thin.

## Audit validation note

No product files were edited and no database migration was applied. Prior agent
reports state focused Jest, ESLint, design-system lint, and app TypeScript checks
passed for their owned seams; this audit inspected those tests and contracts but
did not treat their mocked success as real integration evidence.
