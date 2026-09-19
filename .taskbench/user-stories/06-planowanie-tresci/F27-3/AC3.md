---
id: AC3
story: F27-3
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Brak wyboru, nieistniejące ID lub niejednoznaczny wybór zatrzymują przygotowanie instrukcji i wymagają doprecyzowania.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/planAcceptance/accept.ts` — Missing/invalid selection is refused and cannot compile an instruction.

## Missing

- A genuine ambiguous-choice clarification/follow-up needs explicit handling beyond a validation conflict.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
