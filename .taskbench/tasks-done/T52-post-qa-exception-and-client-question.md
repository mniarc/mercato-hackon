# T52 - Bring saved post-QA exceptions to employees with exact post questions

State: done
Delivered: `23bc9e681`; headed native post QA → employee task → exact-post client question/answer passed, with the exception still open. Same journey verified separate successful content acceptance and no-send publication preparation. No paid calls or database reset.
Depends on: T49 saved post execution, T45 native research exception, T44 employee questions
Sources: F48-1 (saved evidence and native employee handoff), F49-2 (question/answer version binding)
Owns: `agency_operations/lib/researchException/**` post handoff/fragment; independently `lib/employeeQuestions/**` and existing question component. Coordinator owns native G graph/DI, employee projection and locale keys.

## Deliver

- Route an actual saved post-production `escalationVersionId` to one native
  employee task inside its originating G workflow. Reuse `getExceptionReview`
  and the existing research-exception fragment; do not create another case lifecycle.
- Verify the exact current open escalation belongs to that saved run/case. Keep
  evidence, blocked work, expected decision and producer return point visible.
  Ordinary review waits and unconfigured execution do not create exceptions.
- Allow the existing authorized employee question to bind a case-owned exact
  post version as well as a brief. Reuse `getPostReview`, normal customer tasks
  and original answer intake. Asking/answering never resolves the parent exception
  or records post acceptance.

## Done when

A saved post-QA exception reaches the employee inbox with its evidence; an exact
post question reaches the client and the answer enters G while the exception stays
open. Use the existing journey and focused changed-boundary checks, not a new harness.

## Boundaries

No guessed producer resumption, budget increase, publication permission or routine
human approval step. T26's missing resume contract and full F50 resolution policy
remain outside this slice. Do not edit runtime code until the T51 demo releases it.
