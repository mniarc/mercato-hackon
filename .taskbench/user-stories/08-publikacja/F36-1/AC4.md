---
id: AC4
story: F36-1
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Zmiana klienta jest obsługiwana przez G, a wyjątek techniczny przez E; OM pokazuje konkretny powód blokady.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — Concrete blocker reasons are stored in preflight.

## Missing

- Connect customer changes to G holds and technical integration exceptions to E.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
