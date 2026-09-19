---
id: AC3
story: F36-4
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Jeżeli wysyłanie już się rozpoczęło, system nie deklaruje gwarantowanego anulowania; kieruje próbę do ustalenia wyniku w 8.6.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — No sending lifecycle exists.

## Missing

- Record post-start hold without false cancellation and route to reconciliation.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
