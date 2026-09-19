---
id: AC4
story: F10-3
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Koordynator nie wykonuje drugiego triażu ani nie przelicza rund poprawek.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/briefRevision/binding.ts` — Mapper extracts quoted answers only; routing remains saved G decision and no round accounting.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19. Saved G change drove revision without another local triage or revision counter. Local intelligence/source fixtures, not live-model proof; alternative paths are not covered by this run.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | passed |
| Live Model | not_run |
