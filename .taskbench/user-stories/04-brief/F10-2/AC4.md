---
id: AC4
story: F10-2
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC4

## Criterion

4.4 wykonuje wynik G; zmiana odbiorców może wrócić do aktualizacji 4.1 lub sprawdzenia 4.5 zgodnie z dyspozycją.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/briefRevision/applyAnswers.ts` — G-authorized known-answer update invokes real4.1/4.2.

## Missing

- Route evidence-check4.5 and broader audience correction impacts.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | not_run |
| Live Model | not_run |
