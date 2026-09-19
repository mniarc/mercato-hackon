---
id: AC2
story: F22-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Dokument określa ton, osobowość, słownictwo, formalność, sposób zwracania się do odbiorcy, emocje i granice komunikacji; zawiera zalecane i niewskazane przykłady.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/tov.ts` — Writer and grounding cover voice principles, wording, style axes, examples and boundaries.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: agency_tov research run a2c4e64a-50e9-4c98-9520-d1367694990b (2026-09-18, live OpenRouter, direct runner): KLI-TOV + 5 TOV-PROFILE versions with tone, personality, vocabulary, formality, address, emotions, boundaries and cited do/don't examples (100% of quotes cited to stored posts). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | passed |
