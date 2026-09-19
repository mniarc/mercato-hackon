---
id: AC1
story: F50-1
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC1

## Criterion

System odczytuje punkt powrotu zapisany w sprawie i sprawdza jego dozwolenie w STD-PROCES.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/researchException/workflow.ts` — Producer return point is displayed only; no authorized resume action is connected.

## Missing

- No resolution-to-STD-PROCES allowed-return validation.

## Decision Required

- T24/T45: approve the specific producer return step, additional guided-attempt allowance and remaining-versus-new budget accounting; no implicit retry authority.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
