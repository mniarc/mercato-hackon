# Agency operations staged review

Date: 2026-09-18

## Decision

Finish and commit `agency_operations` as an independent baseline before bringing
in `origin/feat/agency-tov-agents`. The two modules have separate ownership and
can coexist without runtime coupling:

- `agency_operations` owns client intake, case state, attachment linkage, the
  case workflow, deterministic worker seam, and employee case visibility.
- `agency_tov` owns tone-of-voice sources, corpus normalization, prompts,
  research agents, batching, rendering, and eventual durable ToV artifacts.

The reviewed ToV branch is one commit (`6310c9b`) and applies cleanly over the
current slice. Preserve unconditional `agency_operations` registration and keep
`agency_tov` inside the existing Enterprise-agent feature gate.

## Closed before commit

- Employee material proof now uses the authenticated, case-keyed agency route
  and verifies the stored sentinel bytes; it no longer blesses the generic
  attachment URL.
- Intake reloads the scoped customer user through the existing
  `customerUserService` and rejects a user not linked to the asserted company.
- Material identity and metadata are non-null database invariants.
- Raw attachment IDs are kept out of staff case DTOs and workflow context.
- The material route uses `AttachmentService.readScoped` with exact owner,
  assignment, private partition, tenant, and organization checks.
- The unused `cases.manage` feature and employee grant were removed.
- Case workflow reads use the decryption-aware scoped read helper.
- Integration cleanup fences workflow children by tenant and organization.

## Honest proof boundary

Focused tests, generation, migration generation, lint, and typecheck validate
the implementation statically. The vertical slice is not runtime-proven until
the agency migration is present in the same initialized PostgreSQL used by the
running app and the targeted Playwright scenario passes.

Open Mercato's generic attachment library/file APIs remain organization-wide:
a principal with `attachments.view` can discover same-organization attachment
IDs, and the generic file route does not consult app-level owner ACL. The module
does not expose the raw ID and uses its owner-aware route, but complete isolation
for custom roles requires a platform attachment access-policy extension or a
coordinated core fix. Do not reimplement attachment storage in the app module.

## Deferred after the spike

- Introduce the smallest command/side-effect boundary for case creation and
  workflow-link writes before calling the module production-grade.
- Make workflow start retry-safe and validate any existing workflow linkage.
- Replace declared file metadata with canonical attachment metadata if policy or
  downstream agents begin relying on it.
- Keep native `USER_TASK` and Work Inbox as the only human-assignment system.
  Bind human tasks only to `customers:customer_company_profile`; never create an
  agency task table or bind regular employee tasks to `agency_operations:agency_case`.

## ToV integration prerequisite

The teammate module currently exposes useful internal agents and a validated
map/reduce pipeline, but no public request-scoped execution service or durable
artifact/result reference. Before integration, ask its owner for one narrow
asynchronous DI contract. `agency_operations` should consume only opaque
execution/artifact references through an optional Enterprise-gated bridge and
must remain functional with its deterministic worker when Enterprise agents are
disabled.
