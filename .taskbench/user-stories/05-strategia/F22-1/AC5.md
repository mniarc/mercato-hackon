---
id: AC5
story: F22-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC5

## Criterion

Strategia i TOV trafiają jako jawnie powiązana para do wspólnej kontroli 5.4; nowy TOV nie dziedziczy wcześniejszej zgody.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/strategyQa.ts` — Joint QA records exact pair; ToV draft creation does not inherit client acceptance.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19 at ef3b5390d: an actually produced strategy and TOV existed as a versioned paired proposal before consent; the positive gated pair reached one shared native review and both exact versions required explicit client approval. Local intelligence fixture, not live-model proof.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | unknown |
