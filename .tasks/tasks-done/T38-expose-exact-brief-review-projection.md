# T38 - Expose a version-bound brief review projection

State: done (read-only service contract; invitation wiring remains T39)
Depends on: merged teammate F09 brief and QA persistence
Owns: `agency_research/lib/contracts/agencyResearch.ts`, `agency_research/lib/researchService.ts`, new `agency_research/lib/briefReview/**`
Sources: F09-3, F10-1, F12-1; existing research service and immutable versions
Context: Current getClientView omits version UUID and exact QA. Document ready_for_review includes both clean and incomplete briefs.

## Deliver

- Add an additive scoped service read for one orderRef and exact versionId. Return document/version identity, currentness, persisted client Markdown and latest 4.2 QA tied to that exact output version. Never infer acceptance from document status.
- Distinguish clean approval-ready, client-data-needed and agent-fix/no-QA states. Keep client questions separate from internal findings; do not regenerate content or run models.
- Preserve existing service methods and teammate agents. Reuse scoped/encrypted native reads and stored records.

## Done when

- Focused checks prove exact scope/version, stale currentness, and missing/failed/client-gap QA never appearing approval-ready. Coordinator checks public service wiring.

## Constraints

- Read-only; no acceptance mutation, new storage, ToV change or full F12 completion claim. Coordinator owns downstream consumer and native workflow wiring.
