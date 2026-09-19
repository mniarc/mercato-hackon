---
id: AC5
story: F06-3
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC5

## Criterion

Dalsza analiza może wskazać brak lub hipotezę zamiast twierdzenia bez dostępnego dowodu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/findings.ts` — Source/audit/findings schemas and gates retain unknowns, hypotheses and evidence limitations.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
