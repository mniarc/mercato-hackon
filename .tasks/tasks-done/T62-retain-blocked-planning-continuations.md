# T62 - Keep blocked planning continuation visible

State: done
Verification evidence: `292656115`; focused planning handoff, native graph,
scoped process projection and staff component checks cover configuration,
dependency, execution and QA holds. Blocked work waits; only an actual invitation
ends review. Controlled producer resumption remains outside this bounded fix.
Depends on: T60; existing planning phase and exact plan review
Sources: F26-1 AC1-2; F27-1 AC4; F48-1 AC4; F50-2 AC1-2
Owns: `agency_operations/lib/planningExecution/**`, `lib/processProjection/**`,
existing `AgencyCaseProcess` staff component, relevant en/pl copy and focused
checks; coordinator owns native graph and its routing check.

The original gap was that planning recorded missing authorization, disabled
execution, unready foundations and incomplete saved runs, but the native graph
still ended at `plan_review` without an invitation.

Return an explicit invited/blocked handoff preserving the original reason and
saved activation reference. Identify permitted inspection of configuration,
accepted foundations, interrupted execution or QA. Only an actual invitation may
reach the review END; blocked work remains waiting and visible on the staff case.
Reuse the existing plan invitation service and native workflow. Do not convert
routine client waits into employee exceptions or change paid execution policy.

Done when the existing caller retains a truthful blocked state with inspection
guidance and a focused check covers the handoff plus coordinator-owned routing.
No automatic replay or resume action: controlled F50 producer continuation remains
unimplemented and must not be implied by this visibility/routing fix.
