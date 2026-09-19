---
id: AC4
story: F23-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Negatywny wynik kieruje poprawę do autora strategii 5.2 lub języka 5.3 i blokuje przedstawienie tej pary jako gotowej.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/strategyQa.ts` — Bounded internal repairs dispatch to 5.2 or 5.3; exhausted result blocks and escalates.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: live to_fix verdict routed a repair to 5.2 (5.2 attempt 2) and blocked the pair until re-QA - live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | passed |
