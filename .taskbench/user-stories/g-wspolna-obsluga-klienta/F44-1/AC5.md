---
id: AC5
story: F44-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC5

## Criterion

Koordynator realizuje wskazany powrót bez automatycznego uruchamiania całego zamówienia od nowa.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/briefRevision/run.ts` — The connected brief response continues a bounded phase without restarting the order.

## Missing

- General G.4 return routing across departments remains absent.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
