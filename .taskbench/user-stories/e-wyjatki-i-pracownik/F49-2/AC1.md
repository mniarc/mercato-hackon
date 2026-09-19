---
id: AC1
story: F49-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Pytanie pracownika zostaje zapisane przy sprawie jako działanie obsługi, a nie jako zdarzenie WE-KLIENT.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/employeeQuestions/service.ts` — Employee question is stored as staff service action and a separate customer task, not client-authored input.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
