---
id: AC5
story: F36-3
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC5

## Criterion

Utrata odpowiedzi nie uruchamia niewidocznego ponowienia; wynik trafia do rozstrzygnięcia 8.6.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — Current lane performs no retry and fabricates no success.

## Missing

- Implement unknown-outcome reconciliation rather than an invisible resend.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
