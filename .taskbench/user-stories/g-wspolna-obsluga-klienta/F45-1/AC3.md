---
id: AC3
story: F45-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Routing obsługuje odpowiedź, doprecyzowanie, odmowę rozszerzenia, zmianę, akceptację, wstrzymanie i przekazanie wyjątku do E.1 zgodnie z wynikiem.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/agents/client-triage/projectResult.ts` — Answer, clarify, exact review approvals and bounded brief revision work.

## Missing

- Refusal, general change, hold and scope-dispute exception routes remain unsupported.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
