# Important-client reuse trace

Date: 2026-09-18  
Scope: employee-attention slice only; customer portal and tone-of-voice work excluded.

## Existing customer classification

- `packages/core/src/modules/customers/data/entities.ts`
  - `CustomerEntity` (`customer_entities`) has `kind`, `displayName`, `ownerUserId`, `status`, `lifecycleStage`, `source`, `temperature`, and `renewalQuarter`; it has no first-class customer/account `priority`, `important`, or `vip` field.
  - `CustomerInteraction.priority` is interaction priority, not customer importance.
  - `CustomerTag` (`customer_tags`) is organization- and tenant-scoped, with stable `slug`, `label`, `color`, and `description`; `(organizationId, tenantId, slug)` is unique.
  - `CustomerTagAssignment` (`customer_tag_assignments`) is the shared tag-to-customer mapping, scoped by organization and tenant.
  - `CustomerLabel` and its assignments are per-user (`userId`), so labels are not appropriate for shared agency classification.
- Tags are already the intended segmentation primitive. `packages/core/src/modules/customers/__integration__/TC-CRM-012.spec.ts` exercises creating/assigning tags and filtering customers under “Tag Customers for Segmentation.” No separate customer-segment entity was found.
- `relationship_health` in `packages/core/src/modules/customers/customFieldDefaults.ts` and lifecycle/temperature dictionaries describe health or lifecycle, not importance. Reusing them for “important client” would overload their semantics.

## Public customer contracts

- Shared tag management: `GET|POST|PUT|DELETE /api/customers/tags` in `packages/core/src/modules/customers/api/tags/route.ts`. Creation accepts a stable lower-case `slug` plus label/color/description.
- Assignment: `POST /api/customers/tags/assign` and `/unassign` in `packages/core/src/modules/customers/api/tags/assign/route.ts` and `unassign/route.ts`, accepting `{ tagId, entityId }` plus request scope.
- Commands in `packages/core/src/modules/customers/commands/tags.ts` emit persistent `customers.tag.assigned` and `customers.tag.removed` events declared in `packages/core/src/modules/customers/events.ts`; payload includes `id`, `tagId`, `entityId`, `organizationId`, and `tenantId`.
- `GET /api/customers/companies` and `/people` (`api/companies/route.ts`, `api/people/route.ts`) accept `id`, comma-separated `tagIds`, lifecycle/status, and custom-field filters. Their queries join `customer_tag_assignments`.
- Detail endpoints return a combined tags/labels presentation and omit the stable tag slug. Do not infer shared importance from a detail-response label string; resolve the shared tag by slug first.

## In-process reuse bridge

- Runtime entity IDs currently include `customers:customer_entity`, `customers:customer_tag`, and `customers:customer_tag_assignment` in `apps/mercato/.mercato/generated/entities.ids.generated.ts`; queryable fields are registered in `apps/mercato/.mercato/generated/entity-fields-registry.ts`.
- Do not import generated `E` identifiers across modules. Resolve IDs at runtime with `getEntityIds()` from `@open-mercato/shared/lib/encryption/entityIds` (`packages/shared/src/lib/encryption/entityIds.ts`).
- Resolve `queryEngine` through DI and type it with `QueryEngine` from `@open-mercato/shared/lib/query/types` (`packages/shared/src/lib/query/types.ts`). The join/filter contract is covered in `packages/shared/src/lib/query/__tests__/engine.test.ts`.
- Minimal lookup:
  1. Query `customers:customer_tag` for `slug = agency-important`, always passing `tenantId` and `organizationId`, and select its `id`.
  2. Query `customers:customer_entity` for the target customer ID with a join `{ alias: 'tag_assignments', table: 'customer_tag_assignments', from: { field: 'id' }, to: { field: 'entity_id' }, type: 'left' }` and filter `'tag_assignments.tag_id': { $in: [tagId] }`, again passing both scope IDs.
- Put this behind one module-local bridge (for example `lib/integrations/clientAttentionBridge.ts`) returning a small deterministic DTO such as `{ customerEntityId, kind, displayName, important, taskPriority }`. This avoids a direct customers ORM dependency and keeps the integration swappable. No agency-owned client table is needed.

## Saved views are not domain state

- `AdvancedFilterPanel` customer saved filters use browser local storage (`packages/ui/src/backend/filters/AdvancedFilterPanel.tsx`).
- Persisted perspectives (`packages/core/src/modules/perspectives/data/entities.ts`, `GET|POST /api/perspectives/[tableId]`) are user/role UI settings.
- Neither is an authoritative, shared client-importance signal; do not drive workflow priority from saved filters or perspectives.

## Workflow contracts and constraint

- `taskPrioritySchema` is exactly `low | medium | high | extreme` in `packages/core/src/modules/workflows/data/task-primitives.ts`.
- `userTaskConfigSchema` in `packages/core/src/modules/workflows/data/validators.ts` includes assignees/roles, instructions, entity bindings, priority, deadline/reminders, and decisions.
- `packages/core/src/modules/workflows/lib/step-handler.ts` interpolates several user-task fields, but persists priority as `userTaskConfig.priority ?? null`. Priority is authored statically; it is not interpolated from workflow context.
- The real employee queue is `GET /api/workflows/work-inbox` in `packages/core/src/modules/workflows/api/work-inbox/route.ts`, guarded by `workflows.tasks.view`. It filters by priority/status/role/assignee/overdue/workflow instance and projects existing `UserTask` rows through `lib/work-inbox/user-task-source.ts`. `lib/work-inbox/provider.ts` orders `extreme`, `high`, `medium`, `low`; unset priority is treated like medium for sorting.
- Workflow conditions evaluate instance/workflow/trigger context (`packages/core/src/modules/workflows/lib/transition-handler.ts`). IF/ELSE and SWITCH routes use inline conditions or persisted rule preconditions (`lib/branching-routes.ts`). A persisted Business Rule is unnecessary for this simple deterministic split.
- Although `assignmentRule` exists in the schema/editor, `packages/core/src/modules/workflows/lib/task-inspector-config.ts` states it is not read by `resolveTaskAssignment`; do not rely on it.

## Lean recommendation

1. Use one shared organization-level customer tag with stable slug `agency-important` as the source of truth. Manage/assign it through the existing customer tag APIs.
2. At intake, have the thin bridge synchronously resolve tag membership and add the deterministic classification to workflow context. Avoid a cache/projection initially; tag assigned/removed events are available later if one becomes necessary.
3. Because `USER_TASK.priority` is static, branch on `clientAttention.important` (or its derived priority) into separately authored nodes: important/escalated work reaches a `USER_TASK` with `priority: high`; ordinary work either ends or reaches a `medium` task, depending on the slice. Do not mutate the `UserTask` record out-of-band.
4. Bind the task to `agency_operations:agency_case` and include the client display name in the task copy. `packages/core/src/modules/workflows/lib/task-entity-aliases.ts` deliberately excludes polymorphic `customers:customer_entity`; if a customer deep link is later required, branch by kind and bind a specific company/person profile alongside the agency case.
5. Reuse Work Inbox for the employee queue. The source module for these rows is `workflows`, so focus/filter agency work using the workflow instance and agency-case entity binding rather than inventing another task table.

This path adds no classification or task migration: customer tags/assignments and workflow `UserTask` storage already exist. The only app-owned business record remains the agency case.

## Binding/ACL reconciliation (correction, 2026-09-18)

The earlier recommendation to bind the `UserTask` to `agency_operations:agency_case` is incorrect for an ordinary employee and is superseded by this section.

- `apps/mercato/.mercato/generated/entities.ids.generated.ts` registers `agency_operations:agency_case`, so `packages/core/src/modules/workflows/lib/task-entity-types.ts` can normalize the authored type. Because the entity is ORM-backed, `packages/core/src/modules/entities/lib/entityClassification.ts` classifies it as a **system** entity.
- System task bindings then pass through `packages/core/src/modules/workflows/lib/task-entity-access.ts`. That resolver requires a static entry from `packages/core/src/modules/entities/lib/entityAcl.ts`; no additive app-entity ACL registration exists. `agency_operations:agency_case` has no entry, so its decision is `{ kind: 'unavailable' }` for non-superadmins.
- `packages/core/src/modules/workflows/lib/task-visibility.ts` requires **every** binding to pass. An unavailable agency-case binding denies visibility/action even when the same task also carries a valid customer binding. Role-queue membership and `workflows.tasks.*` grants do not bypass that entity clause. Only the explicit superadmin short circuit does.
- `customers:customer_company_profile` is an enumerated task type in `packages/core/src/modules/workflows/lib/task-entity-aliases.ts`, maps to `customers.companies.view` in `packages/core/src/modules/entities/lib/entityAcl.ts`, and receives a native deep link from `packages/core/src/modules/workflows/lib/work-inbox/entity-links.ts`. The default employee role receives `customers.companies.view` in `packages/core/src/modules/customers/setup.ts`.
- For this intake seam, `AgencyCase.customerEntityId` originates from the customer account's company scope. `packages/core/src/modules/customer_accounts/lib/customerEntityOwnership.ts` defines `customerEntityId` as a scoped CRM company ID and validates `kind: 'company'`. Although the generated entity type names the company profile, existing company detail routes/deep links use the base customer entity ID, so this is the correct binding ID.

Correct authored task binding for the current company-based intake is therefore:

```ts
entityBindings: [
  {
    entityType: 'customers:customer_company_profile',
    idPath: 'context.customerEntityId',
    label: 'Client',
  },
]
```

Keep the agency case as the workflow's own primary entity and use the workflow-instance link plus an agency-owned `workflows.task.detail:context` widget to render case/material/evidence. Do **not** also add an agency-case task binding until Open Mercato exposes a supported ACL registration contract for regular app system entities. An unbound backoffice task would pass the entity clause vacuously, but the supported company binding is better here because it preserves client context, ACL semantics, and the native company deep link.
