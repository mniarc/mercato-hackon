---
id: AC1
story: F54-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Moduł realizacji instancjonuje STD-PROCES, uruchamia własnych wykonawców agentów i zapisuje ich rezultaty w OM.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/activate.ts` — App-owned native workflows invoke teammate agentRuntime-backed workers and persist real task/document results; intelligence fixtures do not replace persistence.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
