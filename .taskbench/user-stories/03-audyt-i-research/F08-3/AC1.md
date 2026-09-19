---
id: AC1
story: F08-3
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Przekazanie wymaga pozytywnego wyniku 3.7 i wskazuje konkretne wersje audytu, analizy konkurencji, mapy ustaleń i źródeł.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/freeze.ts` — Freeze requires latest positive QA and records exact version set and hash.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
