---
id: AC4
story: F21-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Hook, argument i CTA pojedynczego postu pozostają zadaniami planu i produkcji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/strategyQa.ts` — QA explicitly identifies tactical content posing as strategy; post authoring remains separate.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: live strategy leaves hook/argument/CTA to plan and post (validated by schema) - live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | passed |
