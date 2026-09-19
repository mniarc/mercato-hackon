---
id: AC1
story: F27-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

QA wskazuje skontrolowaną wersję planu i aktualne zaakceptowane założenia.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/planQa.ts` — QA stores exact plan and accepted foundation input versions.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: plan_qa pinned the checked plan version and accepted foundations live - live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | passed |
