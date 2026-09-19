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

Keep each capability collocated inside `agency_operations`. Portal and backend
UI stay in self-contained feature directories. Domain code does not import UI,
and integration-specific calls sit behind thin module-local bridges using public
Open Mercato contracts. Add a bridge only for a real integration seam that may
be swapped; do not build speculative layering.

## Loop

1. **Observe** — choose one user-visible outcome and identify the next real seam.
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
