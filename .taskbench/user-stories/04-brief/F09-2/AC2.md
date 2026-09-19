---
id: AC2
story: F09-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Treść nieobjęta dyspozycją pozostaje zachowana, chyba że wskazana zależność wymaga jej zmiany.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/brief.ts` — Previous_brief now reaches each writer and prompts preserve unaffected text.
- `ai-company/apps/mercato/src/modules/agency_research/lib/agents/brief.ts` — All brief writers receive previous_brief and explicit instructions to preserve unaffected content, changing only current findings/client answers/repair findings and their dependencies. This is model-driven implementation; semantic preservation has not been demonstrated with native or live-model execution.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | not_run |
| Live Model | not_run |
