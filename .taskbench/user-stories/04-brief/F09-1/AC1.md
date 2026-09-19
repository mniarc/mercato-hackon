---
id: AC1
story: F09-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Propozycja KLI-BRIEF korzysta ze zweryfikowanego pakietu 3.8, WEW-USTALENIA, WZR-BRIEF, danych zakupu i STD-OFERTA.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/brief.ts` — Brief receives order, findings, sources, audit; initial research chain runs after positive freeze.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: brief writers consumed the frozen 3.8 package, WEW-USTALENIA and order data live - live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36); live GUI cases aaedcb14-b416-4cd6-9f06-d1dc06ab7e61 and 26fcfecf-7ef7-4887-80f9-0fabb1007755 (Flow Centrum Badawcze, agency_operations.analysis.v1, 2026-09-19 13:00-18:10). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | passed |
