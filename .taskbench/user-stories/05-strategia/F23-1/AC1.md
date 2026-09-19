---
id: AC1
story: F23-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC1

## Criterion

Wynik QA wskazuje dokładne wersje strategii, TOV i briefu oraz kryteria kontroli z STD-PROCES.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/strategyQa.ts` — QA task pins exact strategy, ToV and brief; criteria are explicit code-owned lists.

## Missing

- Criteria are not loaded from the assigned version of STD-PROCES.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
