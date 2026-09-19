---
id: AC1
story: F21-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

KLI-STRATEGIA zawiera pozycjonowanie, obietnicę wartości, wyróżnik z warunkami wiarygodności, rolę komunikacji w celach biznesowych, filary tematyczne oraz granice wizerunkowe marki.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/strategy.ts` — Writer and schema produce positioning, value proposition, proof architecture, pillars and creative boundaries.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: strategy_writer.* produced KLI-STRATEGIA with positioning, promise, differentiator conditions, role of communication, pillars and boundaries live - live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36); brief/pair/plan acceptance was simulated by the CLI (simulation_flag); the agents ran live, the client decision did not. Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | passed |
