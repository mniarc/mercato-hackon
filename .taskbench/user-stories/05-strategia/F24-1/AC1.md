---
id: AC1
story: F24-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Klient otrzymuje oba dokumenty po pozytywnym QA, z widocznymi identyfikatorami wersji i uzasadnieniem kluczowych wyborów.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/strategyPairReview/service.ts` — Exact current QA-approved pair is rendered and stored in immutable native customer invitation.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19. Portal displayed both actual QA-ready producer documents at their exact versions. Local intelligence/source fixtures, not live-model proof; alternative paths are not covered by this run.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
