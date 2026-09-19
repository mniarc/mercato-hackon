---
id: AC3
story: F46-1
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Zarezerwowana, jeszcze niewysłana próba może zostać unieważniona i nie jest wykonywana na wcześniejszej gotowości.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — No reservation is taken by the existing publication lane.

## Missing

- No atomic invalidation of a reserved unsent attempt.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
