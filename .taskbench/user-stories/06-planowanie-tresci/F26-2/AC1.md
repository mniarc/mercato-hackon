---
id: AC1
story: F26-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Plan jest oparty na aktualnych zaakceptowanych wersjach briefu, strategii i TOV oraz wskazuje użyte analizy i źródła.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/planningExecution/run.ts` — Only accepted current brief/strategy/ToV with pinned source and competition inputs reach planner.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: plan_writer.topics/balance_recommendation built KLI-PLAN on the current brief, strategy and TOV versions live - live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36); brief/pair/plan acceptance was simulated by the CLI (simulation_flag); the agents ran live, the client decision did not. Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | passed |
