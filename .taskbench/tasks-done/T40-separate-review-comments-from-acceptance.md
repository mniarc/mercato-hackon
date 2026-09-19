# T40 - Allow brief clarification without permitting premature acceptance

State: done (bounded consumer behavior; producer wiring remains T39)
Depends on: existing teammate review UI; T39 producer uses existing status contract
Owns: `agency/data/document-review.ts`, `agency/components/DocumentReview.tsx`, `agency/components/AgencyTaskPage.tsx` and their adjacent existing tests only
Sources: F09-3, F10-1, F12-1; existing teammate review request payload

## Deliver

- Make current needs_review briefs commentable but not acceptable. Current ready_for_review remains the approval-eligible state, supplied only after exact QA by T39. Stale or terminal reviews stay non-actionable.
- Preserve exact version and retry-stable event identity, existing annotations, other document behavior and real request endpoint. No second viewer, demo-data fallback or API authority inferred from UI state.

## Done when

- Focused consumer checks prove client gaps can produce a comment but not acceptance, and stale/terminal versions cannot submit. Existing successful review behavior remains.

## Constraints

- No new review schema field unless the existing status contract cannot express this distinction; coordinate first. No backend, research service, locale or shared runtime edits; coordinator owns any needed locale keys.
