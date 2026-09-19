---
id: AC1
story: F12-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Zapis wymaga dyspozycji 4.4, briefu gotowego według 4.2 oraz oryginału decyzji klienta w WEW-ZGLOSZENIE.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/briefAcceptance/accept.ts` — Acceptance requires exact positive brief QA and typed source of original G-directed decision.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19. Only the original client approval of the newly QA-ready brief opened acceptance. Local intelligence/source fixtures, not live-model proof; alternative paths are not covered by this run.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
