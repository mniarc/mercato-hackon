---
id: AC3
story: F41-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Odpowiedź klienta pozwala uzupełnić powiązanie z zachowaniem oryginału i historii.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/employeeQuestions/service.ts` — Original client replies are linked to the originating case/question.

## Missing

- No flow updates ambiguous contact/order binding from a clarification reply.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
