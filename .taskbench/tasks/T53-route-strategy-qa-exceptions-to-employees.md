# T53 - Route saved strategy/ToV QA exceptions to employees

State: active
Implementation: `23bc9e681`; native graph and scoped saved-result binding checks pass. Strategy-specific runtime handoff remains unexercised; the shared employee surface is already proven through post QA, so do not create another UI journey for it.
Sources: F48-1 (saved exception handoff), F23-1 (failed pair stays blocked)
Depends on: T43 phase execution; T52 shared native exception task
Owns: `agency_operations/lib/researchException/strategyHandoff.ts`; coordinator owns shared exception helper, native G graph/DI and employee projection.

## Deliver

Connect the teammate's saved strategy escalation to the existing native employee
exception task in the originating G workflow. Bind it to the case, brief-acceptance
submission and saved execution outputs; reuse `getExceptionReview` and the shared
exception fragment. Keep evidence and the producer's return point visible.

Successful pair execution keeps its existing client-review handoff. Ordinary waits
do not become exceptions. Do not change teammate QA rules, add routine approvals,
or invent resumption, budget increases or publication permission.

## Done when

A genuine saved strategy escalation reaches the employee task and the normal pair
path remains intact. Check this changed binding and native handoff, reusing T52's
employee surface; no new browser journey or full-pipeline fixture. Full exception
resolution and live-model proof remain outside this bounded delivery.
