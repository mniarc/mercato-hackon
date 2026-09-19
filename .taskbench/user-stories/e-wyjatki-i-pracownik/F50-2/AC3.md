---
id: AC3
story: F50-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Nowa informacja klienta wraca do G i nie jest automatycznie traktowana jako spełnienie wszystkich warunków.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/employeeQuestions/service.ts` — Customer answer enters native G and does not itself close an employee exception.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
