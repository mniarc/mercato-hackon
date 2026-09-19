# T62 - Keep blocked planning continuation visible

State: active
Depends on: T60; existing planning phase and exact plan review
Sources: F26-1 AC1-2; F27-1 AC4; F48-1 AC4; F50-2 AC1-2
Owns: `agency_operations/lib/planningExecution/**`, `lib/processProjection/**`,
existing `AgencyCaseProcess` staff component, relevant en/pl copy and focused
checks; coordinator owns native graph and its routing check.

The planning activity already records missing authorization, disabled execution,
unready foundations and incomplete saved runs. Its review handoff currently
returns no invitation and the native graph nevertheless ends at `plan_review`.

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
