---
id: AC4
story: F09-3
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Błąd redakcji lub opracowania przez agenta wraca do 4.1 zamiast obciążać klienta jego naprawieniem.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/briefQa.ts` — Agent faults rerun existing4.1 under bounded QA repair; T63 exhaustion escalation is separately active.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: live agent-side findings re-ran 4.1 (attempt 2/3 on aaedcb14) instead of asking the client - live GUI cases aaedcb14-b416-4cd6-9f06-d1dc06ab7e61 and 26fcfecf-7ef7-4887-80f9-0fabb1007755 (Flow Centrum Badawcze, agency_operations.analysis.v1, 2026-09-19 13:00-18:10). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | passed |
