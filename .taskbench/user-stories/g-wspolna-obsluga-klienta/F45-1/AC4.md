---
id: AC4
story: F45-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Lokalny koordynator używa zapisanej kwalifikacji; nie uruchamia G drugi raz dla tego samego rozstrzygnięcia.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/agents/client-triage/projectResult.ts` — Implemented downstream activities use saved G result and source submission instead of invoking triage again.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
