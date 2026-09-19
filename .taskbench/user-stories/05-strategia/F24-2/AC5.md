---
id: AC5
story: F24-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC5

## Criterion

Zgoda obejmuje wyłącznie pokazane dokumenty i nie zatwierdza z góry planu lub postu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/strategyPairAcceptance/accept.ts` — Receipt applies only to exact strategy/ToV versions and confers no plan/post approval.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19. Pair consent left the later produced plan awaiting its own client choice. Local intelligence/source fixtures, not live-model proof; alternative paths are not covered by this run.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
