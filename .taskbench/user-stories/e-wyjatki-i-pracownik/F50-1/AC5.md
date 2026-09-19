---
id: AC5
story: F50-1
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC5

## Criterion

Historia pokazuje rozstrzygnięcie, wynik kontroli i rzeczywisty powrót do zadania.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/researchException/workflow.ts` — Native hold decision history exists, but no actual return event exists.

## Missing

- No linked decision, prerequisite-check outcome and executed return record.

## Decision Required

- T24/T45: approve the specific producer return step, additional guided-attempt allowance and remaining-versus-new budget accounting; no implicit retry authority.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
