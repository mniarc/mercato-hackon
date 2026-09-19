---
id: AC5
story: F33-1
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC5

## Criterion

Wstrzymanie lub nowa uwaga do postu respektuje stan wykonania: przed wysyłką blokuje próbę, po starcie wymaga rozstrzygnięcia w 8.6.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — No sending reservation/attempt lifecycle exists.

## Missing

- Connect G hold/change to pre-send invalidation and post-start reconciliation; actual sending awaits proposed publication scope.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
