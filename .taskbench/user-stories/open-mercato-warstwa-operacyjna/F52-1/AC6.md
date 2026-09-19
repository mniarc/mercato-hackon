---
id: AC6
story: F52-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC6

## Criterion

Po spełnieniu warunków zadania agentów mogą ruszać niezależnie od godzin pracy ludzi; oczekiwanie ma konkretny powód: klient, zależność albo wyjątek E. Nie stanowi to obietnicy konkretnego czasu realizacji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/activate.ts` — Native queued agent phases run without routine human approval once authorized.

## Missing

- Paid bootstrap currently waits at awaiting_execution; unsupported branches and disabled live activation prevent full autonomous fulfilment.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
