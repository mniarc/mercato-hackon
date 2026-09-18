# T01 module reuse research

## 2026-09-18 — module/data/orchestration evidence

### Reuse search result

- No `agency_operations`, agency-case, or marketing-agency module exists under
  `apps/mercato/src/modules/` or `packages/`. `external/official-modules/` is not
  present in this checkout.
- The app-specific module location is
  `apps/mercato/src/modules/agency_operations/`, activated with
  `{ id: 'agency_operations', from: '@app' }` in
  `apps/mercato/src/modules.ts`.
- `apps/mercato/src/modules/example/README.md` is the canonical app-module
  capability map. It says not to copy the tree; select only the needed rows from
  `references/surface-inventory.json`. Relevant readable sources are:
  `data/entities.ts`, `data/validators.ts`, `commands/todos.ts`,
  `api/todos/route.ts`, `api/openapi.ts`, `index.ts`, `acl.ts`, `setup.ts`,
  `events.ts`, `ce.ts`, and `migrations/**`.
- There is no implemented `mercato module scaffold` command in
  `packages/cli/src`; the matching document in `.ai/specs/2026-07-05-*` is a
  specification, not a callable scaffold. Do not plan around that CLI command.

### Domain ownership already supplied by Open Mercato

| Domain name | Existing owner/evidence | App table needed? |
|---|---|---|
| Client | `customers.CustomerEntity` (`customers:customer_entity`), with `kind = company`; `CustomerUser.customerEntityId` is explicitly the portal company-scope key | No |
| Client portal identity | `customer_accounts.CustomerUser`, portal auth and portal RBAC | No |
| Human employee | `auth.User(kind='human')` plus `staff.StaffTeamMember.userId` | No |
| Agent worker | `defineAgent(...)` registry entry; orchestrator provisions `AgentPrincipal` backed by `auth.User(kind='agent')` | No |
| Material/file | `attachments.Attachment`, addressed by `{ entityId, recordId }` and tenant/org scope | No |
| Agent execution | `agent_orchestrator.AgentRun`, immutable after terminal; correlated by `(workflowInstanceId, stepId, invocationId)` | No |
| Business execution | core `WorkflowInstance`; enterprise `ProcessInstance` is only its derived business-facing projection | No |
| Agency intake/case | No exact platform owner found | Yes: one app-owned `AgencyCase` |

The minimum honest first schema is therefore one table, `agency_cases`. Creating
`agency_agent_workers`, `agency_materials`, or `agency_agent_runs` would duplicate
platform-owned concepts.

### Critical T01 constraint conflict

- `packages/core/src/modules/workflows/AGENTS.md` and
  `lib/activity-executor.ts` define `INVOKE_AGENT` as an optional bridge into
  enterprise `agent_orchestrator`.
- `packages/enterprise/src/modules/agent_orchestrator/AGENTS.md` says every real
  run persists `AgentRun`; business execution must enter via a real workflow and
  `INVOKE_AGENT`, not `/agents/:id/run`.
- `agent_orchestrator/lib/runtime/agentRuntime.ts` dispatches the registered
  agent and owns run persistence, identity, guardrails, and trace behavior.
- Consequently the current task clause “Keep Enterprise Agent Orchestrator
  disabled” cannot coexist with “persist a real AgentWorker + AgentRun” or a
  real `INVOKE_AGENT`. With that module disabled, an app-local run ledger would
  be an invented competing abstraction. Either enable `agent_orchestrator` for
  T01, or describe T01 as workflow-only and defer all AgentWorker/AgentRun
  claims.

### Minimum `AgencyCase` persistence shape

Suggested fields (camelCase properties / snake_case columns):

- `id: uuid`
- `tenantId: uuid`
- `organizationId: uuid`
- `customerEntityId: uuid` — FK-id by value to
  `customers:customer_entity`; no ORM relation
- `submittedByCustomerUserId: uuid` — FK-id by value to the authenticated portal
  user; no ORM relation
- `title: text`
- `createdAt`, `updatedAt`, `deletedAt`

Do not add a second lifecycle `status` on the case. `WorkflowInstance` owns
execution state and `ProcessInstance.status` is derived. Start the business
process with `sourceEntityType = 'agency_operations:agency_case'` and
`sourceEntityId = case.id`; use `idempotencyKey = case.id` (or a stable prefixed
form) so retries cannot start two executions. Do not add assignee, agent-worker,
run, or material-link columns until a demonstrated read/write path needs them.

Useful indexes:

- `(tenant_id, organization_id, customer_entity_id, created_at)` for portal case
  lists.
- `(tenant_id, organization_id, created_at)` for staff lists.

Entity imports and conventions:

```ts
import type { OptionalProps } from '@mikro-orm/core'
import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'
```

Use `@Entity({ tableName: 'agency_cases' })`, a UUID primary key, required scope
columns, `updated_at` with `onCreate` + `onUpdate`, and nullable `deleted_at`.
Every query must bind both `tenantId` and `organizationId`; portal queries must
also bind `customerEntityId` from trusted `CustomerAuthContext`, never request
input.

### Attachments/materials

- Public contract: resolve `attachmentService` through DI and import its type
  from `@open-mercato/core/modules/attachments`.
- `AttachmentService.createScoped` accepts `entityId`, `recordId`, tenant/org,
  a private `partitionCode`, filename/mime/buffer, and optional assignments.
- Use owner `{ entityId: 'agency_operations:agency_case', recordId: case.id }`.
  The attachment row is the material record; the case does not need an
  `attachmentIds` JSON column or a material join table.
- Multipart intake must call `attachmentService.readUploadForm()` before
  `createScoped()` so the platform bounds the request stream. Reads use
  `readScoped()` and deletion uses `releaseScoped()`; never import Attachment ORM
  entities or storage drivers from the agency module.
- Relevant files:
  `packages/core/src/modules/attachments/AGENTS.md`, `index.ts`,
  `lib/attachment-service.ts`, `data/entities.ts`.

### Agent worker and run

- Code-authored worker reference:
  `apps/mercato/src/modules/agent_examples/ai-agents.ts` and
  `packages/enterprise/src/modules/agent_orchestrator/lib/sdk/defineAgent.ts`.
- Exact definition import:
  `defineAgent` from
  `@open-mercato/enterprise/modules/agent_orchestrator/lib/sdk/defineAgent`;
  `AiAgentDefinition` type from
  `@open-mercato/ai-assistant/modules/ai_assistant/lib/ai-agent-definition`.
- The agent ID is a frozen contract. Use one stable ID such as
  `agency_operations.material_intake`; do not persist a second worker row.
- A real business path must invoke that ID through workflow `INVOKE_AGENT`; the
  orchestrator writes `AgentRun` and its invocation correlation. Do not call the
  playground `/agents/:id/run` route for business execution.
- No sanctioned deterministic/no-LLM agent runner was found. Native
  `defineAgent` runs through the configured model; workflow dry-run can use
  sample outcomes but is explicitly simulation. A deterministic intelligence
  stub therefore needs an explicit design decision at the provider/runner seam;
  it must not be disguised as a real orchestrator run or implemented as an
  app-owned `AgentRun` table.

### Commands, CRUD, ACL, and setup

- Validate with Zod in `data/validators.ts`; infer input types with `z.infer`.
- Domain writes go through registered commands:
  `CommandHandler` / `registerCommand` from
  `@open-mercato/shared/lib/commands`. Prefer
  `runCrudCommandWrite` from
  `@open-mercato/shared/lib/commands/runCrudCommandWrite` for entity + custom
  fields + post-commit CRUD side effects. Scoped reads use
  `findOneWithDecryption` from
  `@open-mercato/shared/lib/encryption/find`.
- CRUD routes use `makeCrudRoute` from
  `@open-mercato/shared/lib/crud/factory`, command-backed actions, and
  `indexer: { entityType: 'agency_operations:agency_case' }`. Every API file
  exports `openApi`; copy the factory wrapper pattern from
  `apps/mercato/src/modules/example/api/openapi.ts`.
- User-editable case responses must include `updatedAt`. Optimistic locking is
  default-on; command endpoints use `assertOptimisticLock` from
  `@open-mercato/shared/lib/crud/optimistic-lock-command`; `CrudForm` derives the
  header from `initialValues.updatedAt`.
- Minimal ACLs should separate staff and portal semantics, for example
  `agency_operations.cases.view/manage` plus
  `portal.agency_cases.view/create`. IDs become frozen once published.
- `setup.ts` exports `setup: ModuleSetupConfig` from
  `@open-mercato/shared/modules/setup`; add staff grants under
  `defaultRoleFeatures` and portal grants under
  `defaultCustomerRoleFeatures`. Existing tenants require both:
  `yarn mercato auth sync-role-acls` and
  `yarn mercato customer_accounts sync-customer-role-acls`.
- Events are declared with `createModuleEvents` from
  `@open-mercato/shared/modules/events`; use stable past-tense IDs such as
  `agency_operations.case.created`. Cross-module start behavior should use a
  persistent subscriber or the orchestrator's declared event trigger, with
  process-start idempotency.
- Do not add empty `di.ts`, `search.ts`, `notifications.ts`, `analytics.ts`, or
  `vector.ts` placeholders. Add a scoped DI service only when a shared portal /
  staff read model actually needs one; `di.ts` must export `register(container)`.

### Migration/generation contract

- `data/entities.ts` is auto-discovered. After adding/activating the module run
  `yarn generate` and verify the agency entity/module appears under
  `apps/mercato/.mercato/generated/`; never edit those generated files.
- Update entity metadata, run `yarn db:generate`, inspect every emitted SQL file,
  and keep only the intended module migration plus
  `agency_operations/migrations/.snapshot-open-mercato.json`. Re-run
  `yarn db:generate`; the touched module should report no changes.
- Do not run `yarn db:migrate` without explicit approval.
- After module activation/page changes run
  `yarn mercato configs cache structural --all-tenants` (generation also has a
  best-effort structural invalidation).
- Small relevant verification before UI: `yarn generate`, `yarn db:generate`
  no-op check, focused command/API tests, then app/package typecheck. The real
  workflow/orchestrator seam needs one integration test proving
  AgencyCase source ID -> WorkflowInstance -> orchestrator AgentRun correlation;
  a unit-only fake is not sufficient evidence for the user’s “real” requirement.

### Primary source paths read

- `AGENTS.md`, `.ai/docs/module-development.md`, `packages/core/AGENTS.md`,
  `packages/core/src/modules/customers/AGENTS.md`, `packages/cli/AGENTS.md`,
  `BACKWARD_COMPATIBILITY.md`
- `apps/mercato/src/modules/example/{README.md,references/surface-inventory.json}`
- `packages/core/src/modules/{customers,customer_accounts,staff,attachments,workflows}`
- `packages/enterprise/src/modules/agent_orchestrator/{AGENTS.md,data/entities.ts,data/validators.ts,commands/processes.ts,lib/runtime/agentRuntime.ts}`
- `apps/mercato/src/modules/agent_examples/{README.md,ai-agents.ts}`

## 2026-09-18 — activation fact

- `apps/mercato/src/modules.ts` activates `agent_orchestrator` only when both
  `OM_ENABLE_ENTERPRISE_MODULES` and `OM_ENABLE_ENTERPRISE_MODULES_AGENTS` parse
  true. Both default to `false` in `apps/mercato/.env.example`. Enabling the real
  bridge for this app requires environment configuration; do not unconditionally
  register a second copy of the module from `agency_operations`.
