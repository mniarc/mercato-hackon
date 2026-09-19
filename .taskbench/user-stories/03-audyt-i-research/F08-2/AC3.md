---
id: AC3
story: F08-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Wynik ma jeden z przewidzianych stanów: gotowe, do poprawy albo wyjątek.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/qa.ts` — QA verdict is constrained to ready/to_fix/exception.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19 at ef3b5390d: the real native workflow completed research gate 3.7 on the paid case and emitted its next brief-review task. Intelligence/source responses were local fixtures; this is native orchestration proof, not live-model proof.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: live verdicts observed: done (ready), to_fix, exception - live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36); live GUI cases aaedcb14-b416-4cd6-9f06-d1dc06ab7e61 and 26fcfecf-7ef7-4887-80f9-0fabb1007755 (Flow Centrum Badawcze, agency_operations.analysis.v1, 2026-09-19 13:00-18:10). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | passed |
