---
id: AC3
story: F27-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Rekomendowany temat ma dostępne dowody wystarczające do opracowania postu; brak jest nazwany jako uwaga.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/planQa.ts` — Recommended topic must be ready and evidence sufficient; missing bank evidence is named.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: live QA flagged evidence sufficiency of the recommended topic - live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | passed |
