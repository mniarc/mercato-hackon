---
id: AC3
story: F23-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Szczegóły taktyczne przedstawione jako strategia i sprzeczności są wymienione jako konkretne uwagi.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/strategyQa.ts` — Findings include contradiction and tactical-detail checks with exact paths and fix owners.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: live QA listed tactical-as-strategy and conflict findings as concrete remarks - live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | passed |
