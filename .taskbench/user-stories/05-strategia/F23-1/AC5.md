---
id: AC5
story: F23-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC5

## Criterion

Pozytywny wynik otwiera 5.5 dla skontrolowanej pary; zmiana dokumentu wymaga QA jego nowej wersji w aktualnym zestawie.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/strategyPairReview/service.ts` — Native pair invitation requires current exact ready QA; new versions require matching QA.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19 at ef3b5390d: an actually produced strategy and TOV existed as a versioned paired proposal before consent; the positive gated pair reached one shared native review and both exact versions required explicit client approval. Local intelligence fixture, not live-model proof.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: live positive 5.4 verdict (ready_for_approval) on the repaired pair - live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | passed |
