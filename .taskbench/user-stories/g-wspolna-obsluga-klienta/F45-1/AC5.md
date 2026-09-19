---
id: AC5
story: F45-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC5

## Criterion

Klient otrzymuje odpowiedź lub informację o następnym kroku bez potrzeby ręcznego wybierania agentów.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/processProjection/query.ts` — Implemented answers, client waits and exact review invitations are surfaced.

## Missing

- Unsupported dispositions do not supply a complete client-visible next business action.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
