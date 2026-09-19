---
id: AC2
story: F36-1
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Wcześniej wykonana publikacja blokuje nowe wykonanie, a nierozstrzygnięta wcześniejsza próba kieruje sprawę do 8.6.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — Pure gate refuses confirmed/unknown prior outcome.

## Missing

- No durable prior-attempt loader or route to actual reconciliation.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
