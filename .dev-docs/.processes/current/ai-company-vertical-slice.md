# AI company vertical-slice process

## Intent

Prove one real, end-to-end agency workflow in Open Mercato before expanding the
product. Planning stays shallow: define the next observable outcome, build it,
run it, learn from it, and only then register the next small task batch.

The first slice is:

1. An authenticated client submits a material in the client portal.
2. The module stores the original submission and starts an Open Mercato work
   case/task.
3. A deterministic agent executor records a run and returns the input unchanged
   or as `accepted`; it makes no LLM or external network call.
4. The real Open Mercato chain persists the result and advances the case.
5. The client sees their submission and status; an assigned employee sees the
   client, case, material, run evidence, and status in the employee workspace.

Only the agent's intelligence is stubbed. Frontend, backend routes, database
persistence, authentication, tenant/organization scoping, permissions, task
execution, and workflow transitions must use real Open Mercato extension points.
Mock transports, in-memory repositories, and disconnected demo screens do not
complete the slice.

## Domain mapping

- **Client**: an Open Mercato customer/organization plus an authorized contact;
  the AI-company module owns the agency relationship, not a duplicate identity.
- **Employee**: an Open Mercato user/staff identity assigned to agency clients;
  the module owns the assignment.
- **Agent worker**: a first-class agency actor assigned a role, department, and
  client work. In later slices it makes ordinary marketing decisions for the
  client; it is not merely an executor configuration or an execution record.
- **Material submission**: immutable original text/file metadata, sender, event
  ID, and its case reference.
- **Work case**: the operational spine joining client, submission, task/run,
  state, and downstream result.
- **Agent run**: a saved execution record with actual input and output evidence.
  Slice one uses a deterministic no-op executor so the seam is real without
  pretending an LLM capability or a marketing decision exists.
- **Open Mercato chain**: persisted task/case transitions after the run. For this
  slice the next state may be terminal `ready`; it is not yet the full
  audit-to-brief-to-strategy pipeline.

Commerce, email intake, real LLM work, arbitrary workflow design, publishing,
payments, and elaborate exception handling are outside the first slice. Seeded
or manually created clients, assignments, and cases are acceptable; mocked
integration is not.

## Continuous task loop

1. Choose the smallest user-visible outcome that exercises the next real seam.
2. Before work starts, add one replayable `App/.tasks/TNN-kebab-case.md` file per
   independently owned unit of work.
3. Give parallel workers disjoint paths. One integration task owns shared and
   generated files.
4. Each worker implements its task, performs its focused check, and reports
   changed files, the result, and any assumption or blocker.
5. The coordinator integrates through the running application and records only
   the next small task batch revealed by that evidence.

Use at most one coordinator plus three workers unless the dependency graph makes
fewer useful. Start independent work together, then wait for agent completion or
an integration boundary; do not repeatedly poll. Extra Codex sessions follow the
same registered task contract and must not share write ownership.

## Task contract

```md
# TNN — <verb + observable outcome>

State: ready
Depends on: none | TNN
Owns: `exact/path/**`
Context: <one to three sentences and optional story references>

## Deliver
- <concrete result>

## Done when
- <observable behavior>
- `<one focused verification command>` passes

## Constraints
- <only task-specific constraints>

## Handoff
Report changed files, verification result, and any blocker or assumption.
```

States are only `ready`, `active`, `done`, or `blocked`. Task files are the
replay record, not a second project-management system.

## Just-enough validation

Prefer one integration test covering submit -> persist -> deterministic run ->
advance -> role-scoped reads. Add a direct record-access check where cheap and
run the narrowest relevant typecheck/build. A real browser smoke run across both
portals is required before calling the slice proven. Add more tests only for a
failure mode encountered or a risky boundary; do not duplicate validation tiers
by default.

The story library is context, not a contract. Cite only the stories that clarify
the current task, and revise the next tasks from working-software evidence.
