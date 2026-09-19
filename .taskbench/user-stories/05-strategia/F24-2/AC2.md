---
id: AC2
story: F24-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Zapis jest możliwy po dyspozycji 5.6, pozytywnym QA pary i potwierdzeniu, że brief bazowy nadal obowiązuje.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/strategyPairAcceptance/read.ts` — Current clean pair QA and still-valid accepted brief are prerequisites to acceptance.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19. Native pair acceptance followed G, real pair QA and the still-current accepted base brief. Local intelligence/source fixtures, not live-model proof; alternative paths are not covered by this run.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
