---
id: AC2
story: F23-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Kontrola obejmuje zgodność z celem, zakresem i dowodami, spójność obu dokumentów oraz obietnice bez pokrycia.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/strategyQa.ts` — Combined semantic agent and deterministic checks cover goals, evidence and unsupported promises.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: strategy_qa checked goal/scope/evidence fit, pair consistency and uncovered promises live - live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | passed |
