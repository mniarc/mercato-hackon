---
id: AC3
story: F51-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Sprawa pokazuje konkretny powód zakończenia prób oraz odpowiedzialnego właściciela.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/escalate.ts` — Concrete task/version/reason and employee queue are persisted and surfaced.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
