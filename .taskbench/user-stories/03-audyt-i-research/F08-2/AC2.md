---
id: AC2
story: F08-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Weryfikowane są wymagane pola, źródła twierdzeń, sprzeczności oraz rozdzielenie faktów i interpretacji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/qa.ts` — Deterministic reference/schema checks combine with native QA contradictions/evidence judgment.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: live QA findings cover required fields, claim sources, conflicts and fact/interpretation separation - live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36); live GUI cases aaedcb14-b416-4cd6-9f06-d1dc06ab7e61 and 26fcfecf-7ef7-4887-80f9-0fabb1007755 (Flow Centrum Badawcze, agency_operations.analysis.v1, 2026-09-19 13:00-18:10). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | passed |
