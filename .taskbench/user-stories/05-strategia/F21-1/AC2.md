---
id: AC2
story: F21-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Dokument wskazuje wersję zaakceptowanego briefu, użyte analizy, źródła oraz uzasadnienie kluczowych wyborów.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/strategy.ts` — Writer receives pinned brief/analysis and persists exact inputVersions and grounded evidence IDs.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: live strategy pins brief/analysis versions and cites source ids with rationale - live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36); brief/pair/plan acceptance was simulated by the CLI (simulation_flag); the agents ran live, the client decision did not. Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | passed |
