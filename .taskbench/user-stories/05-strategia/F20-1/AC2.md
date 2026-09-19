---
id: AC2
story: F20-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Każde zadanie ma wykonawcę, zależności, wersję briefu i używane wersje analiz widoczne w OM-02.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/strategyExecution/run.ts` — Activation and tasks persist runner/models, dependency versions and native AgentRun references; existing ledger exposes them.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
