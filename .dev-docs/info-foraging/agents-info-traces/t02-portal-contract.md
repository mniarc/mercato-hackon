# T02 portal/auth/attachment contract research — 2026-09-18

## Canonical sources inspected

- `App/ai-company/packages/core/src/modules/customer_accounts/AGENTS.md`
- `App/ai-company/packages/ui/AGENTS.md` (portal extension and portal DataTable sections)
- `App/ai-company/packages/core/AGENTS.md` (portal discovery, API routes, setup/RBAC)
- `App/ai-company/packages/core/src/modules/workflows/api/portal/tasks/route.ts`
- `App/ai-company/packages/core/src/modules/workflows/frontend/[orgSlug]/portal/tasks/{page.tsx,page.meta.ts}`
- `App/ai-company/packages/core/src/modules/customer_accounts/lib/customerAuth.ts`
- `App/ai-company/packages/core/src/modules/customer_accounts/lib/customerEntityOwnership.ts`
- `App/ai-company/packages/core/src/modules/customer_accounts/services/customerUserService.ts`
- `App/ai-company/packages/core/src/modules/attachments/{AGENTS.md,index.ts}`
- `App/ai-company/packages/core/src/modules/attachments/lib/attachment-service.ts`
- `App/ai-company/packages/documents/src/modules/documents/api/[id]/attachments/route.ts`
- `App/ai-company/packages/documents/src/modules/documents/commands/attachments.ts`

## Exact portal surface

Recommended self-contained capability tree inside the app module:

```text
apps/mercato/src/modules/agency_operations/
  api/portal/cases/route.ts
  api/portal/cases/[id]/material/route.ts       # only if download is in T02
  frontend/[orgSlug]/portal/agency/
    page.meta.ts                                # discovered security/nav contract
    page.tsx                                    # thin route component
    _components/AgencyClientWorkPage.tsx        # upload + status UI only
    _hooks/useAgencyCases.ts                    # state/refetch; calls client bridge
    _lib/casesApi.ts                            # sole browser `apiCall` + DTO boundary
  lib/portal-case-principal.ts                  # sole customer auth/RBAC/link bridge
  lib/attachment-service.ts                     # sole attachment DI wrapper/constants
```

The discovered page remains `/{orgSlug}/portal/agency`; the discovered API is
`/api/agency_operations/portal/cases`. Underscore child folders keep the client
capability collocated without creating routes. `page.tsx` should only render the
capability component. UI must not import customer-account entities, attachment
entities, or workflow internals.

Required page metadata:

```ts
import type { PageMetadata } from '@open-mercato/shared/modules/registry'

export const metadata: PageMetadata = {
  requireCustomerAuth: true,
  requireCustomerFeatures: ['portal.agency_cases.view'],
  titleKey: 'agency_operations.portal.title',
  title: 'Agency work',
  nav: {
    label: 'Agency work',
    labelKey: 'agency_operations.portal.nav',
    group: 'main',
    order: 30,
    icon: 'briefcase-business',
  },
}
```

The `(frontend)` catch-all enforces this metadata and generates the RBAC-filtered
portal nav. Do not wrap the page in a second `PortalShell`; use portal primitives
such as `PortalPageHeader` and `PortalCard` inside the existing shell. For a list,
use `DataTable` from `@open-mercato/ui` with portal-safe props only.

Browser calls must use:

```ts
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
```

Pass a `FormData` body directly and do not set `content-type`; the browser adds
the multipart boundary. Put this call only in `_lib/casesApi.ts`.

## Portal API authentication and RBAC

Portal API routes must bypass the staff guard and enforce customer auth themselves:

```ts
export const metadata: { requireAuth?: boolean } = { requireAuth: false }
```

Canonical imports:

```ts
import {
  getCustomerAuthFromRequest,
  requireCustomerFeature,
  type CustomerAuthContext,
} from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import type { CustomerRbacService } from '@open-mercato/core/modules/customer_accounts/services/customerRbacService'
import type { CustomerUserService } from '@open-mercato/core/modules/customer_accounts/services/customerUserService'
import { isOwnedCompanyEntity } from '@open-mercato/core/modules/customer_accounts/lib/customerEntityOwnership'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
```

Canonical route sequence (see workflows portal task routes):

1. `getCustomerAuthFromRequest(request)`; return 401 when null.
2. Resolve `customerRbacService`; call `requireCustomerFeature(auth, [feature], rbac)`.
3. Resolve the current `CustomerUser` with
   `customerUserService.findById(auth.sub, auth.tenantId, auth.orgId)`.
4. Treat the fresh row as authoritative for CRM links. The helper validates the
   session and ACL every request, but `customerEntityId` / `personEntityId` in
   its returned context come from JWT claims and can be stale after relinking.
5. Require a non-null `customerEntityId`, and confirm it remains an active,
   same-scope company with `isOwnedCompanyEntity(em, id, { tenantId:
   auth.tenantId, organizationId: auth.orgId })`. `auth.sub` is the stable portal
   submitter/contact actor; a CRM `personEntityId` is an optional link, not a
   caller-controlled input.

Never accept `tenantId`, `organizationId`, `customerEntityId`,
`submittedByCustomerUserId`, or `personEntityId` from body/query/form fields.
Derive them as:

- tenant: `auth.tenantId`
- organization: `auth.orgId`
- portal contact/submitter: `auth.sub`
- client company: freshly loaded `CustomerUser.customerEntityId`
- optional CRM person: freshly loaded `CustomerUser.personEntityId`

Feature convention is canonical:

- `portal.agency_cases.view`
- `portal.agency_cases.create`

Grant buyer both and viewer only view through
`setup.ts.defaultCustomerRoleFeatures`. Do **not** add portal feature IDs to
`acl.ts`; that file is the staff feature catalog. `staff/setup.ts` documents this
explicitly for `portal.time_reports.view`, and workflows uses the same convention
for `portal.tasks.*`. Keep separate `agency_operations.cases.*` staff IDs in
`acl.ts`.

After grants change, existing tenants need:

```text
yarn mercato customer_accounts sync-customer-role-acls
```

Customer RBAC caches for five minutes, so a just-synced signed-in session may
need refresh/re-login or cache expiry.

## IDOR rules

- Every list query includes `tenantId`, `organizationId`, `customerEntityId`,
  and `deletedAt: null` at the database lookup boundary.
- Every detail/material lookup includes the requested case ID plus that same
  full scope. Do not fetch by ID and authorize later.
- A foreign tenant, organization, company, deleted row, and random UUID all
  return the same 404 body. Never reveal that a foreign case exists.
- Create does not accept an existing case/customer ID; it always creates for the
  derived principal.
- If a future upload targets an existing case, load it with the full composite
  scope before reading bytes or calling the attachment service.
- Portal-admin wildcard permission does not widen customer ownership.

## Attachment contract

The module already declares hard dependencies on `attachments` and
`customer_accounts`, so resolve the real service and fail closed; never fall back
to direct entities/storage or the staff-only generic attachment endpoint.

Public type import and DI seam:

```ts
import type { AttachmentService } from '@open-mercato/core/modules/attachments'

const attachmentService = container.resolve('attachmentService') as AttachmentService
```

Multipart flow:

1. Call `attachmentService.readUploadForm(request)`; if unavailable return 503.
   Never use `request.formData()` as a fallback because the service bounds the
   raw stream even when `Content-Length` is absent/chunked.
2. Require `form.get('file') instanceof File`.
3. `attachmentService.validateUpload({ fileName: file.name, fileSize: file.size })`.
4. Convert once with `Buffer.from(await file.arrayBuffer())`.
5. Call `createScoped` with both scope IDs, private partition
   `privateAttachments`, and exact owner + assignment:

```ts
const owner = { entityId: 'agency_operations:agency_case', recordId: caseId }
await attachmentService.createScoped({
  ...owner,
  tenantId: principal.tenantId,
  organizationId: principal.organizationId,
  partitionCode: 'privateAttachments',
  fileName: file.name,
  declaredMimeType: file.type || null,
  buffer,
  assignments: [{ type: owner.entityId, id: owner.recordId }],
  persistLink: async (tx, attachmentId) => { /* persist module-owned link/snapshot */ },
})
```

`createScoped` supplies real storage, MIME detection/active-content blocking,
private-partition validation, quota reservation/recovery, scoped attachment row,
and transactional `persistLink`; it is not a mock and must not be reimplemented.

### Current T01 entity gap

`AttachmentService` deliberately has no cross-module owner-list/metadata read,
and peer modules are forbidden to query `Attachment` directly. Therefore
`AgencyCase` must retain the scalar `materialAttachmentId` plus a minimal
metadata snapshot (`materialFileName`, `materialMimeType`, `materialFileSize`).
This is the platform-sanctioned FK-ID + snapshot coupling, not a second Material
entity or ORM relation. Make fields nullable for T01 cases without intake.

Use `createScoped.persistLink(tx, attachmentId)` to persist/update those case
fields in the same DB transaction as the attachment row. This prevents a saved
attachment without its agency link. Re-check the current principal/case scope in
that callback if provider I/O may outlive the initial authorization, following
the documents command precedent.

For an optional download endpoint, first load the case with the full portal
scope, then call `attachmentService.readScoped` with:

- `attachmentId: case.materialAttachmentId`
- the customer auth context (structurally has `sub`, `tenantId`, `orgId`)
- the same `expectedOwner`
- the same `expectedAssignment`
- `expectedPartitionCode: 'privateAttachments'`
- `requirePrivatePartition: true`

Return `private, no-store`, CSP sandbox, nosniff, content type/disposition/length
headers as in the documents attachment GET route. Do not expose the generic
`created.url` as the portal URL; serve through the company-authorized module
route.

## Lean API/UI result shape

One route can support the slice:

- `GET /api/agency_operations/portal/cases` ->
  `{ ok: true, items: PortalAgencyCase[], total }`
- `POST /api/agency_operations/portal/cases` multipart `file` ->
  `{ ok: true, item: PortalAgencyCase }` with 201

`PortalAgencyCase` should expose only `id`, `title`, derived workflow status,
`workflowInstanceId`, material metadata snapshot, `createdAt`, and `updatedAt`.
Do not expose tenant/org/customer/submitter identifiers to the browser when the
UI does not need them. The POST uses the T01 case/workflow service/command; the
route must not duplicate workflow execution logic.

Suggested stable accessible copy for browser proof: heading `Agency work`, file
label `Client material`, submit button `Submit material`, success status
`Material submitted`, and visible workflow `Status`. All are i18n keys with
fallbacks; tests should prefer role/label plus returned case ID/status rather
than brittle translated prose.

## Scope-adjusted teammate handoff

The customer-portal teammate owns all UI and portal API implementation. The
agency module should expose one self-contained, production intake seam rather
than any portal-specific shortcut:

```ts
type TrustedAgencyIntake = {
  tenantId: string
  organizationId: string
  customerEntityId: string
  submittedByCustomerUserId: string
  personEntityId?: string | null
  file: { fileName: string; declaredMimeType?: string | null; buffer: Buffer }
}
```

Every ID above is trusted server context. The caller must derive it from a valid
customer session, current portal RBAC, and a freshly reloaded same-scope
`CustomerUser`; none may originate in browser body/query/form data. The module
validates UUIDs/scope again, but does not accept an untrusted "scope override."

The seam owns exactly this atomic sequence: pre-generate the case ID; call the
real `attachmentService.createScoped`; use owner/assignment
`agency_operations:agency_case + caseId`; in `persistLink(tx, attachmentId)`
persist the case and its attachment ID/metadata snapshot; only after that commit
start the real T01 workflow and save its instance ID/status. A workflow-start
failure must remain an honest persisted failure/retry state, not pretend the
intake vanished.

The teammate may call this seam only from its authenticated portal route. There
must be **no insecure dev endpoint**, test-only HTTP bypass, caller-supplied JWT
claims, direct attachment-table access, direct storage write, staff-generic
attachment endpoint, or mocked frontend/backend integration. Tests inject the
service/port in-process; production HTTP always crosses customer auth/RBAC and
the module-local intake seam.
