---
id: AC5
story: F07-3
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC5

## Criterion

Hipoteza wyróżnika nie jest oznaczana jako finalna strategia przed poznaniem intencji klienta.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/competitors.ts` — Difference candidates retain claim strength/limitations; strategy is separate and gated by accepted brief.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: live comparison keeps differentiators as hypotheses (no final-strategy marking) - live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36); live GUI cases aaedcb14-b416-4cd6-9f06-d1dc06ab7e61 and 26fcfecf-7ef7-4887-80f9-0fabb1007755 (Flow Centrum Badawcze, agency_operations.analysis.v1, 2026-09-19 13:00-18:10). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | passed |
