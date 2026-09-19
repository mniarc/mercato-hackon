# T46 - Reach client reviews from the case page

State: done (bounded navigation change; focused page composition check passed)
Depends on: T39
Owns: `ai-company/apps/mercato/src/modules/agency/frontend/[orgSlug]/portal/agency/cases/[id]/page.tsx`, `cases/_components/__tests__/AgencyCasePage.test.tsx`; coordinator-owned locale additions
Sources: F10-1, F55-1; teammate portal task route overrides and native workflow portal tasks
Context: The case page currently shows its intake workflow status but offers no path to native client review tasks. Native task listing is already authorized and rendered by the teammate portal.

## Deliver
- Distinguish intake status from completion of the whole case.
- Link to the real portal task inbox without duplicating its list, viewer, or authorization.

## Done when
- Case details retain the real status and conversation and link to the same organization's native Tasks route.
- A focused page composition check covers the link and intake-only explanation.

## Constraints
- No inferred case stage, pending count, or case-task filtering: the public task list does not expose case workflow metadata.
- This bounded navigation improvement does not prove all F10-1 or F55-1 acceptance criteria.
