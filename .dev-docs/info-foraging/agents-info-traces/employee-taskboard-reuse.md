# Employee attention/taskboard reuse — raw findings (2026-09-18)

Scope: employee human-attention layer only. Customer portal and tone-of-voice are explicitly excluded.

## Decision

Use the OSS `workflows` module's persisted `UserTask` plus its existing Work Inbox and task-detail UI. Do **not** create an agency task/assignment table and do **not** reuse the `staff` time-tracking Kanban for this seam.

The smallest real path is:

1. Routine agency runs stay agent-only.
2. Only an attention result (important client, escalation, guardrail/error, or explicit attention flag) enters a `USER_TASK` step.
3. That step writes the platform `user_tasks` row and pauses its workflow.
4. Employees use `/backend/work-inbox`, claim/receive the item, inspect the linked client and workflow evidence, then complete a decision.
5. Completion resumes the same workflow. A `return_to_agent` decision can route to a subsequent `AUTOMATED`/`EXECUTE_FUNCTION` step; another decision can finish or route elsewhere.

No additional agency-owned table is needed. `AgencyCase` remains the agency aggregate; `WorkflowInstance`/`WorkflowEvent` are execution evidence; `UserTask` is the durable human-attention record.

## Exact reusable contracts

### Durable task model and creation

- `packages/core/src/modules/workflows/data/entities.ts`
  - `UserTask` table `user_tasks` already stores `workflowInstanceId`, `stepInstanceId`, status, form schema/data, `assignedTo`, `assignedToRoles`, `claimedBy/claimedAt`, priority, due date, client/entity bindings, completion data, reassignment audit, tenant/org scope, timestamps.
  - statuses: `PENDING | IN_PROGRESS | COMPLETED | CANCELLED | ESCALATED`.
- `packages/core/src/modules/workflows/data/validators.ts`
  - `userTaskConfigSchema` supports `assignedTo`, `assignedToRoles`, dynamic assignment, `formSchema`, instructions, entity bindings, priority `low|medium|high|extreme`, deadline/reminders, decisions, and breach behavior.
- `packages/core/src/modules/workflows/lib/step-handler.ts`, `handleUserTaskStep`
  - reaching `USER_TASK` creates the real `UserTask`, logs `USER_TASK_CREATED`, emits `workflows.task.assigned`, schedules SLA jobs, and pauses the instance.
  - dynamic assignee fallback is an authored role queue; unresolved portal assignment falls back to backoffice.
- `packages/core/src/modules/workflows/lib/task-resolution.ts`
  - an individual `assignedTo` is a backoffice auth user id; `assignedToRoles` are exact tenant role names.
  - a default role named `employee` exists (`packages/core/src/modules/auth/lib/setup-app.ts`, `DEFAULT_ROLE_NAMES`). A lean spike can queue to `['employee']`; later routing may supply a concrete auth user id without changing persistence.

### Employee inbox and prioritization

- `packages/core/src/modules/workflows/backend/work-inbox/page.tsx`
- `packages/core/src/modules/workflows/backend/work-inbox/page.meta.ts`
  - existing employee page: `/backend/work-inbox`; guarded by auth and `workflows.view_tasks`.
- `packages/core/src/modules/workflows/api/work-inbox/route.ts`
  - `GET /api/workflows/work-inbox`; filters include kind, module, entity type, role, priority, status, overdue, `myWork`, assigned user, workflow instance, pagination.
- `packages/core/src/modules/workflows/lib/work-inbox/provider.ts`
  - this is a projection, not another table.
  - canonical ordering is priority (`extreme`, `high`, `medium`, `low`), nearest due date, then oldest first.
- `packages/core/src/modules/workflows/lib/work-inbox/user-task-source.ts`
  - existing `user_task` provider projects `UserTask` rows, links detail to `/backend/tasks/{id}`, and advertises claim/unclaim actions.
- `packages/core/src/modules/workflows/api/work-inbox/next/route.ts`
  - `POST /api/workflows/work-inbox/next` atomically claims the highest-ranked claimable workflow task; racing claimers cannot receive the same row.

### Assignment, claim, completion, and handback

- `packages/core/src/modules/workflows/api/tasks/[id]/claim/route.ts`
  - `POST /api/workflows/tasks/{id}/claim`, requires `workflows.tasks.claim`, verifies server-derived role membership, moves role-queued work to `IN_PROGRESS`.
- `packages/core/src/modules/workflows/api/tasks/[id]/unclaim/route.ts`
  - `POST /api/workflows/tasks/{id}/unclaim`, releases the caller's claim back to the role queue and returns it to `PENDING`.
- `packages/core/src/modules/workflows/api/tasks/[id]/reassign/route.ts`
  - `POST /api/workflows/tasks/{id}/reassign`, requires `workflows.tasks.reassign`, accepts either a user or roles, clears an active claim, records `reassignedBy/reassignedAt/reassignReason`, logs `USER_TASK_REASSIGNED`, and honors optimistic locking.
- `packages/core/src/modules/workflows/api/tasks/[id]/complete/route.ts`
  - `POST /api/workflows/tasks/{id}/complete`, requires task ownership and `workflows.tasks.complete`; validates form data, persists comments/decision, merges form data into workflow context, and resumes execution.
- `packages/core/src/modules/workflows/lib/task-handler.ts`
  - `completeUserTask` chooses an authored decision's durable `transitionId`, logs completion, advances the step, and invokes `executeWorkflow`.
  - Therefore "hand back to an agent" is a normal decision route from `USER_TASK` to an `AUTOMATED` step; it needs no custom handoff table/status or direct call from UI to an agent worker.

### Existing employee ACL defaults

- `packages/core/src/modules/workflows/acl.ts`
  - existing features cover view, claim, complete, view-all, reassign, and manage.
- `packages/core/src/modules/workflows/setup.ts`
  - default `employee` receives `workflows.view`, `workflows.view_tasks`, `workflows.tasks.view`, `.claim`, `.complete`, and `workflows.instances.view`.
  - admin gets `workflows.*`.
  - existing tenants require `yarn mercato auth sync-role-acls` after ACL changes; for this recommendation no new workflows feature is needed.

### Reason/evidence and linked records

- `packages/core/src/modules/workflows/backend/tasks/[id]/page.tsx`
  - existing task detail renders instructions/form/decision buttons beside entity context, and links the owning workflow instance at `/backend/instances/{workflowInstanceId}`.
  - completion offers claim-next, so no agency taskboard UI is needed for the first slice.
- `packages/core/src/modules/workflows/lib/work-inbox/navigation.ts`
  - frozen injection spot `workflows.task.detail:context` lets the agency module render its own case/material/evidence card without changing the workflows page.
- `packages/enterprise/src/modules/agent_orchestrator/widgets/injection-table.ts` and `widgets/injection/task-proposal-draft/widget.ts`
  - exact reference for a module-owned widget mounted on that spot.
- `packages/core/src/modules/workflows/lib/work-inbox/entity-links.ts`
  - native deep links include customer company/person/deal and sales order.
- `packages/core/src/modules/workflows/lib/task-entity-access.ts` and `packages/core/src/modules/entities/lib/entityAcl.ts`
  - entity binding visibility is fail-closed and feature-aware. A binding to `customers:customer_company_profile` is supported and requires `customers.companies.view`.
  - `CustomerUser.customerEntityId` is specifically the linked CRM company id (`packages/core/src/modules/customer_accounts/lib/customerEntityOwnership.ts`), so the agency case can safely bind its existing `customerEntityId` as `customers:customer_company_profile`.
  - Do **not** bind only `agency_operations:agency_case` yet: regular app entities have no additive entity-ACL registry, and an unknown system entity is unavailable to non-superadmins. Keep the supported customer-company binding for visibility/deep link, use the task's workflow-instance link, and render the agency case/material/evidence through the agency-owned task-detail widget.

### Notifications and SLAs already exist

- `packages/core/src/modules/workflows/subscribers/task-assigned-notification.ts`
- `packages/core/src/modules/workflows/lib/task-notifications.ts`
- `packages/core/src/modules/workflows/notifications.ts`
  - `workflows.task.assigned` creates in-app/email notification for the concrete assignee or every member of the role queue.
  - reminders and deadline-breach notifications are already implemented; links target `/backend/tasks/{id}`.

## Routing recommendation for the agency slice

The employee surface must not mirror every run. The attention decision belongs before entering `USER_TASK` and should be supplied through one agency-local attention-routing seam. Keep its payload small and domain-neutral:

- `requiresHumanAttention: boolean`
- `priority: low|medium|high|extreme`
- `reason: string`
- `evidence: structured/sanitized summary or references`
- optional `assignedTo` or fallback `assignedToRoles: ['employee']`

The source may later be client tier, deterministic rules, guardrail failure, or a real agent result. This module should not decide tone-of-voice semantics. For the spike, use a deterministic fixture/flag that raises exactly one real task and a routine fixture that raises none.

Author the human step with:

- title/instructions interpolating reason and sanitized evidence;
- supported customer-company entity binding using the existing `customerEntityId`;
- priority/deadline;
- `assignedToRoles: ['employee']` unless a concrete auth user id was selected;
- decisions such as `return_to_agent` (transition to the next automated worker) and `finish`/`resolve` (transition to end or the next domain step).

If conditional routing inside the current code workflow proves awkward, the lean alternative is a separate code-defined attention workflow started through the same public `workflowExecutor` bridge only when the deterministic result says attention is required. This is still real Open Mercato persistence/UI and avoids modifying core or seeding a speculative business-rule layer.

## Explicit non-reuse / exclusions

- `packages/core/src/modules/staff/lib/time-tracking-ui/TaskBoardScreen.tsx` and `staff_time_tasks` are a project/time-tracking Kanban: tasks require a time project/status board and use `StaffMember` assignees. That is a different domain and would duplicate workflow task lifecycle. Do not use it for agency attention work.
- `inbox_ops` is inbound-email/proposal processing, not the generic employee assignment seam.
- Do not add a customer-facing page/API; another team owns customer portal.
- Do not add tone-of-voice entities, fields, prompts, rules, or UI; another team owns tone of voice.
- Do not enable Enterprise Agent Orchestrator merely for this taskboard. OSS workflows already provide the required task, assignment, claim, priority, notification, audit, and resume behavior.

## Minimum proof worth implementing later

1. Routine case executes without a `UserTask`.
2. Attention case creates one scoped `UserTask` with customer-company binding, reason, evidence, priority, and role queue.
3. Employee sees it in `/backend/work-inbox` in priority order and receives a notification.
4. Two employees racing to claim cannot both win.
5. Task detail links the customer and workflow; agency widget renders the case/material/evidence.
6. `return_to_agent` completion records the decision and resumes the automated workflow step.

