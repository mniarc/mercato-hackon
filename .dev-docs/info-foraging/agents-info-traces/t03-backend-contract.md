# T03 backend employee-case contract research (2026-09-18)

## Current T01 contracts observed

- Module: `apps/mercato/src/modules/agency_operations` (`index.ts` requires
  `attachments`, `customer_accounts`, `customers`, and `workflows`).
- Entity: `AgencyCase`, table `agency_cases`, generated ID expected
  `agency_operations:agency_case`.
- Scoped fields: `tenantId`, `organizationId`, `deletedAt`; scalar platform
  references only (no cross-module ORM relations).
- Employee read shape available from the case row:
  `id`, `customerEntityId`, `submittedByCustomerUserId`, `title`,
  `agentWorkerId`, `materialAttachmentId`, `materialFileName`,
  `materialMimeType`, `materialFileSize`, `workflowInstanceId`, `createdAt`,
  `updatedAt`.
- Stable worker: `agency_operations.agent-worker.noop.v1`.
- Workflow: `agency_operations.process-case`; steps `start -> agent_worker -> end`;
  function `agency_operations.processCase`; result context key
  `agentWorkerResult`.
- `AgencyCase.workflowInstanceId` is the link. Authoritative runtime state and
  evidence remain in Open Mercato `WorkflowInstance`/`StepInstance`; no local
  AgentRun/result entity should be added.
- ACL is already defined:
  `agency_operations.cases.view` and `agency_operations.cases.manage`, with
  manage depending on view. T03 is read-only and needs only `view`.

## Exact feature route recommendation

Keep the staff feature inside the module and collocated by capability:

```text
agency_operations/
  api/cases/route.ts
  backend/agency-operations/cases/
    page.tsx
    page.meta.ts
    _components/AgencyCasesTable.tsx
    _lib/caseViewModel.ts
    [id]/
      page.tsx
      page.meta.ts
      _components/AgencyCaseDetail.tsx
```

The discovery-facing route/page files stay thin. Components call only the
backend-local `caseViewModel` adapter. The adapter uses public HTTP contracts
through `apiCall`; it must not import workflow UI/entities or query another
module's ORM tables.

Public surfaces:

- list page: `/backend/agency-operations/cases`
- detail page: `/backend/agency-operations/cases/:caseId`
- case list and single-record read: `GET /api/agency_operations/cases`; use
  `?id=:caseId&pageSize=1` for a detail read, as the CRUD factory already
  supports this pattern when `id` is mapped in `buildFilters`
- canonical workflow page: `/backend/instances/:workflowInstanceId`
- public workflow reads used by the module-local view model:
  `/api/workflows/instances/:workflowInstanceId` and
  `/api/workflows/instances/:workflowInstanceId/steps?limit=100`
- secure material link: `buildAttachmentFileUrl(materialAttachmentId)` from
  `@open-mercato/core/modules/attachments/lib/imageUrls`

Do not add an agency proxy endpoint for workflow reads and do not import
`WorkflowInstance`/`StepInstance` into agency UI. That would duplicate a real,
scoped platform contract. The module-local adapter is the isolation boundary.

## Staff auth, ACL, navigation

API metadata:

```ts
const routeMetadata = {
  GET: {
    requireAuth: true,
    requireFeatures: ['agency_operations.cases.view'],
  },
}
```

List page metadata should use the built-in sidebar discovery instead of a menu
widget:

```ts
export const metadata = {
  requireAuth: true,
  requireFeatures: ['agency_operations.cases.view'],
  pageTitle: 'Agency cases',
  pageTitleKey: 'agency_operations.cases.list.title',
  pageGroup: 'Agency operations',
  pageGroupKey: 'agency_operations.nav.group',
  pageOrder: 100,
  icon: 'briefcase-business',
  breadcrumb: [
    { label: 'Agency cases', labelKey: 'agency_operations.cases.list.title' },
  ],
}
```

Detail metadata uses the same auth/feature, `navHidden: true`, and a breadcrumb
back to `/backend/agency-operations/cases`.

Relevant evidence:

- `packages/core/src/modules/auth/AGENTS.md`: new guards use immutable feature
  IDs in `requireFeatures`, never role names.
- `packages/core/src/modules/customers/backend/customers/people/page.meta.ts`:
  exact list nav/page metadata fields.
- `packages/core/src/modules/customers/backend/customers/people/[id]/page.meta.ts`:
  hidden detail navigation and list breadcrumb.
- `packages/core/src/modules/workflows/setup.ts`: default `employee` role already
  has `workflows.instances.view`.
- `packages/core/src/modules/attachments/setup.ts`: default `employee` role
  already has `attachments.view`.

## Scoped case API

Use a read-only `makeCrudRoute`, not a hand-written unscoped `em.find` route.
Exact imports/patterns:

```ts
import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { E } from '#generated/entities.ids.generated'
import { AgencyCase } from '../../data/entities'
```

Configure:

- `orm.entity: AgencyCase`
- `idField: 'id'`
- `tenantField: 'tenantId'`
- `orgField: 'organizationId'`
- `softDeleteField: 'deletedAt'`
- `indexer.entityType: E.agency_operations.agency_case`
- list query: `id?`, `page`, `pageSize <= 100`, `search?`, `sortField`,
  `sortDir`
- `buildFilters`: map `id` and escaped title search
- fields/project only case UI fields; do not expose tenant/org unnecessarily
- `transformItem`: stable camelCase view DTO and ISO timestamps
- export only `GET = crud.GET`; there are no T03 writes
- export an `OpenApiRouteDoc`

Canonical reference:
`packages/core/src/modules/push_notifications/api/deliveries/route.ts` is a
minimal read-only `makeCrudRoute` with metadata, tenant/org scope, GET-only
export, and OpenAPI. `apps/mercato/src/modules/example/api/todos/route.ts`
shows explicit `id` filtering and DTO transformation.

## Backend-local view model

`caseViewModel.ts` should own API DTO parsing/mapping so React components do not
know cross-domain response envelopes. Use only:

```ts
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
```

Detail load sequence (parallel after the case read):

1. Read case through
   `/api/agency_operations/cases?id=<id>&pageSize=1`.
2. Empty items means page-level not-found.
3. If `workflowInstanceId` exists, `Promise.all` the existing workflow instance
   and steps reads.
4. Map only rendered fields. Take status from `WorkflowInstance.status` and
   authoritative input/output from the `agent_worker` `StepInstance`
   (`inputData`, `outputData`, `errorData`). The persisted instance context's
   `agentWorkerResult` can be a fallback/readout, not a new local record.
5. Build material link from the case's persisted attachment ID using
   `buildAttachmentFileUrl`; display the persisted filename/MIME/size snapshot.

The existing workflow endpoints are themselves staff-authenticated,
feature-gated with `workflows.instances.view`, and tenant/organization scoped.
References:

- `packages/core/src/modules/workflows/api/instances/[id]/route.ts`
- `packages/core/src/modules/workflows/api/instances/[id]/steps/route.ts`
- `packages/core/src/modules/workflows/api/openapi.ts`
  (`workflowStepInstanceRowSchema`)
- `packages/core/src/modules/workflows/backend/instances/[id]/page.tsx`
  (canonical `apiCall` consumer and `/backend/instances/:id` links)

## UI reuse

List imports/patterns:

```ts
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
```

- Columns: title (link to detail), client reference, material filename, stable
  worker ID, created timestamp.
- `RowActions` item must have stable `id: 'open'`; set
  `rowClickActionIds={['open']}` and row-click to the same detail route.
- Pass `isLoading`, translated error/empty state, and real pagination to
  `DataTable`; page size 20 is enough for the spike.
- No export, advanced filters, bulk actions, or employee mutations in T03.

Detail reuse:

```ts
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { FormHeader } from '@open-mercato/ui/backend/forms'
import { LoadingMessage, ErrorMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { JsonDisplay } from '@open-mercato/ui/backend/JsonDisplay'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { formatAttachmentFileSize } from '@open-mercato/ui/backend/detail'
```

- Required state order: `loading -> notFound -> error -> ready`.
- `FormHeader mode="detail"`, back to the case list, title = case title,
  entity label = translated `Agency case`.
- Reuse standard status variants:
  COMPLETED success, FAILED error, RUNNING info, PAUSED/COMPENSATING warning,
  CANCELLED/COMPENSATED/unknown neutral.
- Use ordinary definition-list/card markup like the canonical workflow detail;
  do not create a new detail primitive.
- Show `JsonDisplay` titled `Run input` and `Run output` for persisted evidence.
- Render a normal secure file link for the material snapshot. Do not use
  `AttachmentsSection`: it exposes upload/metadata/delete writes and T03 is a
  read-only employee view.
- Render `Open workflow run` linking to `/backend/instances/:id` rather than
  cloning the workflow inspector.
- All user-facing text belongs in the module's locale files and uses `useT()`.

References:

- `.ai/ui-backend-components.md` detail/page/forms/table guidance
- `packages/core/src/modules/eudr/backend/eudr/evidence-submissions/page.tsx`
  for `Page` + `DataTable` + row links/actions/pagination
- `packages/core/src/modules/workflows/backend/instances/[id]/page.tsx` for
  `FormHeader`, status/detail layout, `JsonDisplay`, and workflow deep links
- `packages/core/src/modules/attachments/lib/imageUrls.ts` for secure file URL
- `packages/ui/src/backend/detail/AttachmentVisualPreview.tsx` for
  `formatAttachmentFileSize`

## Focused verification

Keep one jsdom page contract test plus T04's real browser proof; do not build a
redundant validation pyramid.

`apps/mercato/src/modules/agency_operations/__tests__/employee-case-view.test.tsx`
should prove:

- the list uses real module API URL and creates an `open` row action/detail link;
- the detail adapter requests the exact public case/instance/steps APIs;
- persisted client/material/worker/status/input/output render;
- workflow link is exactly `/backend/instances/:workflowInstanceId`;
- missing case renders `RecordNotFoundState`.

Test patterns:

- `packages/core/src/modules/eudr/backend/eudr/evidence-submissions/__tests__/page.test.tsx`
  for jsdom page/API/DataTable mocks
- `packages/core/src/modules/workflows/backend/tasks/__tests__/taskDetailPage.test.tsx`
  for detail-page `apiCall`, `JsonDisplay`, and link assertions

Stable T04 semantic selectors:

- heading `Agency cases`
- case-title link on the list and same title as the detail heading
- worker text `agency_operations.agent-worker.noop.v1`
- persisted material filename
- status text `Completed`
- link label `Open workflow run`, href `/backend/instances/:workflowInstanceId`

Do not add tone-of-voice/style fields or client-portal coupling; those surfaces
are teammate-owned.
