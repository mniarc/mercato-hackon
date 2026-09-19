---
id: AC3
story: F26-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Horyzont wynosi 30 dni, liczba tematów pochodzi z katalogu, a dokument wskazuje jeden rekomendowany temat do produkcji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/plan.ts` — Planner enforces 30-day horizon, pinned topic count and one recommended ready topic.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: live plan: 30-day horizon, 12 topics, one recommended topic - live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | passed |
