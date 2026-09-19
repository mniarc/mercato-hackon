---
id: AC4
story: F09-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Nowa wersja nie dziedziczy wcześniejszej akceptacji i przechodzi ponownie kontrolę 4.2.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/briefRevision/run.ts` — New brief version receives fresh QA and no inherited approval record.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19. Revised brief received fresh QA and remained unapproved until a separate client action. Local intelligence/source fixtures, not live-model proof; alternative paths are not covered by this run.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | passed |
| Live Model | not_run |
