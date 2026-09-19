---
id: AC4
story: F36-3
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Zapis odpowiedzi rozróżnia potwierdzenie z ID wiadomości, pewne odrzucenie i wynik nieznany; brak odpowiedzi nie jest sukcesem.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — Confirmation schema distinguishes outcomes, current builder returns only not_executed.

## Missing

- Classify and persist real provider success/rejection/unknown evidence.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
