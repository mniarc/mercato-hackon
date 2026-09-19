---
id: AC3
story: F21-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Niepotwierdzone założenia i ograniczenia są oznaczone; brak dowodu nie staje się potwierdzoną obietnicą.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/strategyQa.ts` — Deterministic support-level and uniqueness checks retain limitations rather than promote unproved claims.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: live strategy marks unconfirmed assumptions; proof_messages carry evidence ids - live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | passed |
