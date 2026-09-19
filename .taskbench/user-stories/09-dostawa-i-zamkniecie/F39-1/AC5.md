---
id: AC5
story: F39-1
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC5

## Criterion

Późniejsze zgłoszenia trafiają do istniejącego G, które rozróżnia błąd agencji od nowej potrzeby; błąd agencji po dostawie nadal podlega obsłudze.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/agents/client-triage/projectResult.ts` — Generic G accepts submissions, but no post-delivery agency-error/new-need semantics are applied.

## Missing

- Implement scoped aftercare distinction and owned correction route.

## Decision Required

- Approve proposed delivery/closure scope and choose the real sharing channel before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
