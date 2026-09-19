---
id: AC1
story: F31-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

QA jest przypisane do wersji KLI-POST i obejmuje instrukcję, fakty, TOV, strategię, ograniczenia kanału, linki i wzmianki.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/postQa.ts` — Exact-version independent editor plus deterministic instruction/facts/ToV/channel/link/mention gates.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: post_editor QA bound to the KLI-POST version, checked instruction, facts, TOV, strategy, channel limits, links live - live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | passed |
