---
id: AC3
story: F10-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Zmiana kierunku nie dodaje automatycznie kolejnej marki, rynku, języka lub rezultatu i nie zmienia ceny zamówienia.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/briefRevision/applyAnswers.ts` — Revision request has no product/currency/new-brand fields; no price or scope mutation. 

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | not_run |
| Live Model | not_run |
