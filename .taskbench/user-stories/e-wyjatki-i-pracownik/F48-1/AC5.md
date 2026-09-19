---
id: AC5
story: F48-1
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC5

## Criterion

Gdy potrzebny jest termin, jest on zapisany jako zobowiązanie pracownika w sprawie.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/researchException/workflow.ts` — Current exception task config sets priority and employee role but no due-date commitment.

## Missing

- No path to record a required employee deadline as a case obligation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
