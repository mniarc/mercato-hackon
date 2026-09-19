# T57 - Give paused production budgets an employee owner

State: done (bounded producer connection; budget-specific runtime journey not claimed)
Sources: F51-1 (AC2-3), F48-1
Owns: existing strategyExecution, planningExecution and postExecution budget catches.

## Deliver

Reuse openEscalation on an actual BudgetPausedError and return the saved exception
reference with the paused outcome. Include the observed step/task, pinned inputs
and ledger facts. Existing native exception adapters create the employee task.

Keep the configured cap and paused outcome intact. Only keep_blocked is offered;
no extra spend, automatic retry, cap mutation or producer resume. Saved-result
replay must not create another exception or model call.

## Done when

Focused producer checks prove saved exception references and replay for the three
phase entry points. Reuse existing native employee routing; no new inbox or demo
journey, and no paid calls.

Evidence: `6d022b783` (pushed). Three focused producer suites passed; after fixing
the paused-task lookup, both affected suites passed again (20 checks). Fixtures
cover QA pausing after a completed repair, exact saved evidence, unchanged caps
and replay without further execution. Existing native exception adapters consume
the new saved references; no new automatic recovery action was introduced.
