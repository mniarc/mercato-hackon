---
id: AC2
story: F31-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Błąd treści tworzy wskazaną poprawkę w 7.2; brak niezbędnego dowodu kieruje zadanie do właściwego kroku procesu 3.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/postQa.ts` — Content defects return to 7.2 within bounded internal repair.

## Missing

- Missing-proof findings have no scoped process3 evidence-return implementation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
