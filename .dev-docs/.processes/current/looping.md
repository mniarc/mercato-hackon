# AI-company delivery loop

Read this file after every context compaction, then inspect the active goal and
the current `App/.tasks/TNN-*.md` task before continuing.

Use [testing.md](testing.md) for the persistent development runtime and focused
checks, [milestone-integration.md](milestone-integration.md) for Git/review, and
[ai-company-vertical-slice.md](ai-company-vertical-slice.md) for task format.

## Non-negotiable boundary

Only the agent worker's intelligence and the teammate-owned customer-portal
caller may be substituted in the first slice. Open Mercato staff authentication,
authorization, tenant scope, employee UI, APIs, attachments, database
persistence, workflow execution, and transitions must be real.

Before adding any functionality:

1. Search Open Mercato modules, extension points, plugins, docs, and examples for
   an existing implementation or public contract.
2. Reuse that contract as-is where it fits. Do not copy platform-owned behavior
   into `agency_operations` or invent a competing abstraction.
3. Add module-owned code only for the agency domain Open Mercato does not own.
4. If a new module is genuinely required, add the smallest app module when that
   need is uncovered and register it through the supported module system.

Treat Open Mercato code, documentation, and skills as the source of truth for
its contracts and extension points, not as a template for our implementation
complexity or delivery ceremony. Use a native workflow only when the product
path needs durable orchestration; keep simple operations simple. Validate at a
real trust or persistence boundary and rely on established platform guarantees
inside it. Add another validation layer only for a distinct, demonstrated risk,
not to re-check the same fact.

## Current delivery objective

Close partial settled stories through real teammate implementations and their
required normal-use alternatives; task counts are not product completion.
P0: replace reachable production scaffolds with authoritative teammate implementations
and connect their real process into the app before adding local fallback behavior.
Preserve native workflow/auth/approval boundaries and test-only intelligence fixtures;
neither is a substitute production agent to remove merely because it is an adapter.
Independent workstreams: T27/T58 client answers → accepted brief → strategy/ToV
→ plan invitation; T65 payment recovery; approved T66 exact-target consent,
retaining `canSend:false`. T25 demo purchase and T59 copy extraction are delivered.
Preserve saved work, exact-version approvals and teammate Polish copy.

Direct agents own disjoint implementation paths. The coordinator orchestrates
owners, shared contracts and integration; delegate implementation and runtime work.
One delegated runtime owner holds the lease for actual shared-state conflicts;
serialize those operations only, while unrelated implementation continues.
A separate capture-only owner saves screenshots under gitignored `App/.visuals/`.
No visual review, HTML inspection or CSS changes until explicitly requested.

Maintain the dedicated recovery exploration → task → implementation cycle below.
Keep source implementation, native/fixture verification and live-model proof separate;
paid calls are not required to complete an implemented feature. After each milestone,
pick the next ready settled-story gap instead of stopping after one slice.
Finish only when the authorized scope and required alternatives are delivered and
proved, or report exact external decisions after useful authorized work is exhausted.

Check known teammate branches every 45 minutes; integrate actual updates with
ancestry and dirty work preserved. Unchanged refs require no rerun. The user now
authorizes pushing coherent verified milestones and useful demo/manual-testing tools
on main; leave unfinished work out. No paid model calls, real payments/publication
or routine database resets.
Intelligence fixtures must not fabricate client decisions, approvals or producer success.
The renewed product goal is active; this loop is not a separate background scheduler.

Keep each capability collocated inside `agency_operations`. Portal and backend
UI stay in self-contained feature directories. Domain code does not import UI,
and integration-specific calls sit behind thin module-local bridges using public
Open Mercato contracts. Add a bridge only for a real integration seam that may
be swapped; do not build speculative layering.

## Loop

1. **Observe** — choose one user-visible outcome and identify the next real seam.
   Check teammate updates every 45 minutes during the renewed delivery run, or
   on an explicit handoff, through the integration process; their implementations
   replace overlapping scaffolds. This cadence authorizes merges, not pushes.
2. **Search** — perform the reuse-first check above and record relevant paths in
   the active task handoff.
3. **Register** — create only the next small replayable tasks in `App/.tasks`.
4. **Assign** — give concurrent workers disjoint paths; one coordinator owns
   shared/generated files and integration.
5. **Implement** — use real Open Mercato call sites and the leanest compliant
   design. Do not build later-slice machinery early.
6. **Verify** — run the task's focused check. Add tests for the changed seam and
   important access boundary, not duplicate validation tiers.
7. **Integrate** — exercise the running application across the affected surfaces.
   Workers hand off changed files, checks, assumptions, and blockers.
8. **Learn** — turn observed gaps into the next small task batch.
9. **Commit** — commit a coherent working milestone on `App/main`; push only when
   requested or agreed.

Start independent direct agents on disjoint paths. Let them complete their tasks
and review the handoff once; do not repeatedly poll or review each intermediate
step. The coordinator owns shared/generated files and shared runtime validation.

Select work from `node scripts/agency-spec-progress.mjs --feature FNN` in
`ai-company/`: read the actual story acceptance criteria, inspect teammate/code
coverage, then task only the missing behavior. A linked done task is not a fully
verified story. Keep several independently useful workstreams moving; agree their
small shared contracts first and serialize only real dependencies. A blocked
handoff must not stop unrelated ready delivery. Prefer finishing and integrating
usable work over opening more scaffolds. A goal names an observable product
outcome and its stopping condition, not a task-count or documentation target.

For expected outcomes such as missing client input, budget pauses, rejected
reviews, or exhausted repairs, trace producer → workflow → user surface → next
authorized action. Internal exceptions are acceptable when handled at that
boundary; a generic error or permanently blocked state does not implement a
required recovery path. Task the missing spec behavior, not every `throw`, and
keep technical failures distinct from normal product outcomes. A story is not
complete until its required alternative paths work; task links and happy-path
demos alone are not full-story coverage.

Keep a separate direct agent on this recovery workstream during active delivery:
explore one real non-happy path → reuse/register its concrete spec-linked task →
implement the smallest authorized fix → hand off once for focused verification.
Assign exclusive code paths before edits; the coordinator owns shared contracts
and runtime. Continue to the next actionable gap, not repeated audits of handled
errors. If product authority is missing, record that exact decision and take another
independent ready path. Do not manufacture tasks merely to keep the agent occupied.

## Unattended integration watch (finished)

Completed window: 2026-09-19 02:56–08:56 UTC (04:56–10:56 Warsaw).
The user ended that watch on return and later authorized a new 45-minute fetch/
integration cadence above. The rules below describe the old window; its push
permission and 30-minute schedule do not carry into the new run.
Keep the broader delivery goal active; this window is not a promise to finish
every story or a reason to manufacture more work.

- Prioritize a pull-and-run app using teammate research/ToV/frontend: intake,
  saved outputs, exact client review, authorized continuation, employee exceptions.
  Finish the current connected slice before starting another production scaffold.
- Every 30 minutes fetch known teammate branches and `origin/main`. Merge actual
  new work at a coherent boundary, preserving ancestry and teammate behavior.
  Unchanged refs mean no merge, review, generation or test rerun.
- Coordinator owns Git, shared contracts, registration and runtime. Use two to
  four direct implementation agents on disjoint missing handoffs when useful,
  one separate canonical-demo agent, and a task/spec agent only when a concrete
  queue/mapping gap exists. Keep spare slots for observed defects; do not fill
  slots with duplicate reviews. No PowerShell fanouts during integration.
- Review each handoff once. Run focused checks for the changed seam, then one
  headed canonical journey when integration affects that journey. Preserve the
  named database. Freeze runtime-affecting edits during that demo; do not run
  competing builds/generators. Do not rerun a failing journey without a relevant
  fix or a specific new diagnostic hypothesis. Reuse passing checks until their
  relevant code/configuration changes.
- Commit and push coherent verified features to `origin/main`; the user explicitly
  authorized milestone pushes for this window. Keep task Markdown out of staging.
  Make no paid model calls during the window: prepare live execution only, with
  activation disabled. Fixture proof is not live model proof.
- Keep active tasks concise and move only genuinely done tasks to `tasks-done/`.
  Update existing milestone ADRs only for actual decisions; no periodic reports,
  inventories, invented requirements or speculative agent frameworks.
- When ready work is exhausted, wait for the next scheduled branch check rather
  than refactor or retest unchanged work. Monitor existing live handles instead
  of restarting on observation timeouts. A quiet teammate branch is not a blocker.
- At the end of the window, hand off integrated tips, commits, working journeys,
  pending runtime/live proofs and concrete blockers. Do not mark the entire
  product goal complete merely because the six-hour window ended.

## First-slice reference

`T01 -> (T02 client-intake handoff || T03 employee backend) -> T04 proof`

Select current work from the user's direction and active task, not this historical
chain. Human escalation can use native workflow UserTask and `/backend/work-inbox`;
routine agent runs do not create human tasks.

The proof is:

`minimal trusted portal substitute -> stored private attachment/case -> stable
agent worker -> deterministic saved run -> real workflow transition -> employee
case view`

The standard Open Mercato `/backend` is the employee workspace. A teammate owns
the customer portal, so do not add its UI/auth/API here; mock only its caller at
the test boundary and provide a narrow trusted intake contract. Another teammate
owns tone of voice, so add no tone profiles, prompts, rules, fields, UI, or tone
processing. The owned app module is `agency_operations`; create no additional
module unless the reuse-first search demonstrates a separate domain boundary.
