---
id: AC5
story: F10-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC5

## Criterion

Wybór odbiorców nie jest sam w sobie akceptacją nowej, jeszcze niepokazanej wersji briefu lub przyszłej strategii.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/briefRevision/applyAnswers.ts` — Answer update creates no acceptance; new current review still requires explicit approval.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19. The supplied audience answer did not approve the revised brief or future strategy. Local intelligence/source fixtures, not live-model proof; alternative paths are not covered by this run.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | passed |
| Live Model | not_run |
