# T61 - Keep blocked strategy continuation actionable

State: done
Verification evidence: `292656115`; focused strategy handoff, native graph,
scoped process projection and staff component checks cover retained reasons and
waiting instead of a false successful review. This proves the bounded routing
and visibility fix, not controlled producer resumption or a live recovery run.
Depends on: T60; existing strategy execution and review handoff
Sources: F20-1 AC3; F48-1 AC2-4; F50-2 AC1-2
Owns: `agency_operations/lib/strategyExecution/**`, `lib/processProjection/**`,
existing `AgencyCaseProcess` staff component, relevant en/pl copy and focused
tests; coordinator owns native workflow and its routing check.

Preserve `not_configured`, `not_ready` and `execution_incomplete` as explicit
blocked handoffs rather than ending at a successful-looking review step with no
invitation. Preserve the original reason and saved execution reference. Show the
next permitted inspection: configuration, dependencies or interrupted execution;
do not pretend inspection itself authorizes retry. Treat the explicit disabled
execution gate as a configuration hold, not an asynchronous technical failure.

Reuse the existing native activity result and employee case/ledger. The shared
workflow must distinguish an actual invitation from a blocked continuation and
retain the latter as waiting, without creating employee exceptions for routine
client waits. No paid replay, new budget authority or producer-resume protocol.
Technical faults and scope/identity invariant failures still propagate.

Done when saved blocked reasons remain visible with their permitted next action,
no blocked outcome reaches the successful review end, and focused checks cover
the module handoff plus coordinator-owned routing. Actual producer recovery
remains separate F50 work; this task does not claim it implemented.
