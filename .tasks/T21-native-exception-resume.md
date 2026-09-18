# T21 - Return one employee exception to its originating step

State: ready
Depends on: T05, T19
Owns: agency exception binding and native workflow/UserTask continuation seam
Sources: F48-1, F49-1, F50-1, F51-1

Use one actual worker failure/exception to establish the next return point.
Reuse the native UserTask inbox and a scoped fixed return target; preserve the
originating workflow/activity, reason/evidence, allowed decision and rationale.
An unresolved exception stays blocked. Prevent duplicate exception creation and
duplicate resumption without restarting the entire case.

Done when an authorized employee decision resumes only the permitted original
step once, with focused failure/replay checks and the canonical demo extended
only at this new seam. Generic task completion is not artifact approval.

Do not handle every hypothetical failure, add a task engine, invent retry policy
or replace native assignment. Coordinator owns shared workflow/runtime wiring.
