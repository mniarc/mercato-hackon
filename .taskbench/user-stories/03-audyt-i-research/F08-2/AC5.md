---
id: AC5
story: F08-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC5

## Criterion

Nierozwiązywalny problem lub przekroczony limit kieruje do E.1 z powodem i właścicielem; wewnętrzne QA nie zużywa rund poprawek klienta.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/researchException/handoff.ts` — Repair exhaustion or unrepairable problem calls real E.1 producer, with native exception handoff available.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: live repair limit exceeded routed to E.1 with reason and owner (4 E.1 records on demo-open-mercato-3) - live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | passed |
