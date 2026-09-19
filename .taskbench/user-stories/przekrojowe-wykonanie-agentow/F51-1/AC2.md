---
id: AC2
story: F51-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Osiągnięcie limitu zadania zatrzymuje kolejne niedozwolone próby i uruchamia przewidzianą obsługę błędu lub E.1.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/strategyExecution/run.ts` — Budget pause persists E.1; bounded strategy/planning/post/brief QA exhaustion now produces employee evidence.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | unknown |
| Live Model | not_run |
