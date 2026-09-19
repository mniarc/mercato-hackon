# T60 - Complete normal-use recovery instead of generic failure

State: active
Depends on: existing native phase execution and employee/client surfaces
Owns: one dedicated agent's bounded expected-outcome exploration and fixes;
assign exact code paths after tracing the first concrete gap
Sources: F48-1, F49-1, F50-1, F50-2; relevant child IDs added for each selected gap

## Deliver

Trace strategy budget exhaustion and adjacent normal-use outcomes through producer,
native workflow, API and customer/employee surface. Distinguish handled internal
exceptions from missing behavior, technical faults and authorization failures.
Existing paused-budget escalation is not a defect simply because it uses a throw.

For each concrete missing spec path, reuse its existing task or register a bounded
task before implementing the smallest real fix. Start with one actionable gap;
no blanket error suppression, broad exception framework or exhaustive throw census.
Keep saved work and show the actual state, reason and permitted next action.
Reuse teammate producers and Open Mercato workflow contracts. Never invent budget
increases, bypass approval, claim success on failure, or restart the whole order.
T27 owns client-answer application; do not duplicate that work here.

Delivered boundaries: T63 saves exhausted brief repairs as an employee exception;
T107 implements explicit recovery of a pending brief review on its separate
workflow (focused checks passed, native recovery proof pending). T78 implements
late-material revision of an unapproved brief (native proof pending). These do
not supply general budget-increase/resume authority or downstream invalidation.

## Done when

The initial strategy/budget trace is classified and each demonstrated missing
spec behavior is either fixed with a focused check or linked to a precise remaining
task/decision. The first safe scoped fix is delivered if one is available. Report
unproved recovery honestly; this bounded sweep does not imply all stories are done.
