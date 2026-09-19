---
id: AC5
story: F26-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC5

## Criterion

Lista tematów nie jest oznaczana jako dostawa tylu gotowych postów; zakupiony rezultat obejmuje jeden post tekstowy.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/planQa.ts` — QA and output explicitly distinguish topic schedule from one delivered post.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: live plan labelled as topics, one post purchased - live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | passed |
