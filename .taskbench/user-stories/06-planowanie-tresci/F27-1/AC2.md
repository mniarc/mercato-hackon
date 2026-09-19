---
id: AC2
story: F27-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Kontrola obejmuje filary, odbiorców, różnorodność, konkretność propozycji i liczbę tematów wymaganą przez katalog.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/planQa.ts` — Deterministic count/pillar/diversity checks plus semantic audience/concreteness review.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: live plan QA covered pillars, audiences, variety, concreteness and topic count - live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | passed |
