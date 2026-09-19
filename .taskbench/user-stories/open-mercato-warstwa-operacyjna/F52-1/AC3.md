---
id: AC3
story: F52-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Oczekiwanie na klienta, blokada zależności i wyjątek pracownika mają czytelny powód oraz właściwego adresata działania.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/processProjection/query.ts` — Client waits, real employee exceptions and strategy/planning blocked reasons are distinct.

## Missing

- Other unsupported business routes and post phase readiness need equally complete actionable state.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
