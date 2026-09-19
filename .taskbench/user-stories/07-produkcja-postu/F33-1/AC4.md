---
id: AC4
story: F33-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Poprawki są realizowane bez limitu rund i bez opłat rundowych; dodatkowy rezultat nie uruchamia produkcji w tym zamówieniu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/postExecution/run.ts` — No per-client-round billing or extra output is produced by the initial producer.

## Missing

- Client revision loop itself is absent; replaying initial activation is not a new scoped revision.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
