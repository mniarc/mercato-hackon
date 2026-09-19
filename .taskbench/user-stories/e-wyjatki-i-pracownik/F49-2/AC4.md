---
id: AC4
story: F49-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Odpowiedź jest wiązana z kontekstem wyjątku oraz właściwą wersją dokumentu, gdy jej dotyczy.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/employeeQuestions/service.ts` — Question and answer retain exception context plus exact brief/post/strategy/ToV/plan version binding.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | passed |
| Live Model | not_run |
