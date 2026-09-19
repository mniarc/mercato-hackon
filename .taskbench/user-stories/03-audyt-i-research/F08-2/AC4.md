---
id: AC4
story: F08-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Wynik do poprawy wskazuje konkretny brak, odpowiedzialnego agenta i właściwy krok 3.2–3.6; nie przekazuje błędnej analizy jako gotowej do 3.8.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/qa.ts` — Blocking findings target existing author steps; only ready proceeds to freeze.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: live to_fix verdicts named the gap, owner agent and step; repairs re-ran 3.5/3.6 (attempt 2-3) before 3.8 - live GUI cases aaedcb14-b416-4cd6-9f06-d1dc06ab7e61 and 26fcfecf-7ef7-4887-80f9-0fabb1007755 (Flow Centrum Badawcze, agency_operations.analysis.v1, 2026-09-19 13:00-18:10); live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | passed |
