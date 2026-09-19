---
id: AC2
story: F44-2
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Triaż rozpoznaje, czy materiał może wpływać na ustalenia; w takim przypadku uruchamia właściwą kontrolę zakresu i wpływu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/agents/client-triage/contract.ts` — Material intent can be represented in triage.

## Missing

- No connected material relevance then scope/impact decision.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
