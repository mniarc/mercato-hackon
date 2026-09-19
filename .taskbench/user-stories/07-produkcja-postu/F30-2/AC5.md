---
id: AC5
story: F30-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC5

## Criterion

Poprawiona wersja jest propozycją wymagającą kontroli i akceptacji; nie oznacza utworzenia dodatkowej publikacji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/postQa.ts` — Each repaired draft goes through independent editor and new review; no extra publication is created.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: live post saved as a proposal for QA/acceptance; one publication document - live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | passed |
