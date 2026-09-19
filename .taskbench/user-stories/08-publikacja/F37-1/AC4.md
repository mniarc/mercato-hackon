---
id: AC4
story: F37-1
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Każda próba, wynik i techniczne ponowienie są zachowane; wyczerpanie limitu lub trwały błąd tworzą eskalację E z dowodami.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — Document-only outcome has no executed attempt history.

## Missing

- Store actual attempts/retries and escalate permanent/exhausted technical errors.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
