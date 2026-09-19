---
id: AC2
story: F09-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Wypełnione informacje mają wskazane źródła; pola wymagające klienta obejmują cele, przyszły kierunek, odbiorców, priorytety, ograniczenia i obsługiwany kanał.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/brief.ts` — Writer gates source IDs; code owns client-dependent decision states and limits.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: live KLI-BRIEF fields carry evidence ids; client-only fields written as proposals with questions - live GUI cases aaedcb14-b416-4cd6-9f06-d1dc06ab7e61 and 26fcfecf-7ef7-4887-80f9-0fabb1007755 (Flow Centrum Badawcze, agency_operations.analysis.v1, 2026-09-19 13:00-18:10) (KLI-BRIEF v1-v10 on aaedcb14); live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | passed |
