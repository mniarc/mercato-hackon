---
id: AC3
story: F49-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Pracownik wybiera dopuszczalne rozstrzygnięcie albo pozostawia blokadę, jeśli nie usunął przeszkody.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/researchException/workflow.ts` — Employee can record keep_blocked, and unresolved tasks remain open for questions.

## Missing

- Other producer-listed resolutions are deliberately not connected.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
