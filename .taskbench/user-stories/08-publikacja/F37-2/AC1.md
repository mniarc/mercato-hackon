---
id: AC1
story: F37-2
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC1

## Criterion

Brak dowodu wysłania ani niewysłania jest zapisany jako wynik nieznany i blokuje nową publikację oraz zamknięcie dostawy.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — Pure prior-outcome gate rejects unknown; closure requires confirmed publication.

## Missing

- No actual timed-out send is recorded as durable unknown and linked to a held case.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
