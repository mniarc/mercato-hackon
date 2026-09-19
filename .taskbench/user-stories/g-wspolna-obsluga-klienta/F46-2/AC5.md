---
id: AC5
story: F46-2
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC5

## Criterion

Powrót z E nie powtarza wykonanej publikacji i nie pozwala zamknąć zamówienia z nierozstrzygniętym wynikiem.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — No live publication/resume/closure pipeline exists.

## Missing

- Exactly-once publication recovery and closure gating remain unimplemented.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
