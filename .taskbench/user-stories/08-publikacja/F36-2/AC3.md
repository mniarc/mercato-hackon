---
id: AC3
story: F36-2
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Istniejąca wykonana publikacja lub próba o wyniku nieznanym uniemożliwia uzyskanie nowej rezerwacji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — Pure preflight knows confirmed/unknown attempts must block.

## Missing

- Enforce against a real durable attempt ledger during reservation.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
