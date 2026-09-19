# T45 - Expose a saved research exception as a native employee task

State: active
Depends on: T26; coordinate T44 employee questions
Owns: `agency_operations/lib/researchException/**`, `agency_research/lib/exceptionReview/**`; coordinator owns public service contract, analysis workflow and DI wiring
Sources: F48-1; teammate exact-version WEW-ESKALACJA contract

Read the saved escalation version through a scoped research service projection.
Bind it to the original case and analysis workflow; expose evidence, blocked
steps and allowed resolutions in an employee USER_TASK within that workflow.
Reuse native task assignment and permissions. Repeated preparation creates no
new workflow/task. Routine client questions or review waits are not exceptions.

The initial task may record keeping the case blocked; it cannot approve a
document, increase budget or rerun analysis. Other continuation remains explicitly
unsupported until its real producer mutation is connected. Leave unresolved
tasks open so employee questions can attach without pretending resolution.

Done when a saved, current, open research exception reaches one native employee
task and wrong-scope/stale projections are rejected; focused checks cover that
boundary and coordinator verifies the connected workflow.
