---
id: AC3
story: F30-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

W OM-04 zapisane są ID wersji, autor-agent, źródła twierdzeń i powiązanie z wybranym tematem planu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/postExecution/run.ts` — Saved versions and task/AgentRun IDs retain author, sources and selected instruction/topic lineage.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: live version row records author agent run ids, claim sources and the selected topic - live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | passed |
