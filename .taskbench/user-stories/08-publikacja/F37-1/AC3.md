---
id: AC3
story: F37-1
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Dopuszczone ponowienie wraca do 8.4, ponownie sprawdzając aktualną wersję, zgodę, cel, blokady i historię prób.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — No actual retry path exists.

## Missing

- Route authorized retry through refreshed preflight and reservation.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
