# T95 - Run the same native agency journey with fixture or live intelligence

State: ready
Priority: P0-immediate
Depends on: T79 pending demo changes must be preserved; T93 owns runtime profiles;
T94 owns the integration journal/index format.
Sources: explicit user request for one integration harness over teammate agents;
existing settled-story journeys, not a new business process.
Owns: `ai-company/apps/mercato/src/modules/agency_operations/__integration__/`
TC-AGENCY-001/002/003 and their support helpers; new mode-selection helpers there.

## Deliver

- Architecture decision: teammate `agency_tov` is the sole producer/owner of
  ToV. Strategy orchestrates the specialist and consumes its exact saved version;
  it must not produce, rewrite or fall back to research-owned ToV. The competing
  `agency_research.tov_writer` path is being retired from active execution by the
  integration owners. Preserve historical reads, but never invoke a retired
  writer merely to satisfy an agent-count assertion. The detached worker owns
  harness adaptation, not this production rewrite; read the current main task
  and owners' source contracts before wiring its ToV checkpoints.
- Keep one primary customer -> agency -> employee scenario and its meaningful
  alternative journeys. Both modes use real teammate agent wrappers, native
  orchestration, tools, auth, API, persistence, QA and explicit human decisions.
- Swap only the existing intelligence/provider boundary: deterministic fixtures
  versus explicitly selected live OpenRouter execution. Do not replace a whole
  producer with a mock that skips its contracts, tools, persistence or handoffs.
- Separate source-material fixtures from intelligence selection. Fixture mode
  must not require live credentials or fall through to paid providers. Live mode
  must never silently use canned intelligence; use the existing central model,
  key and budget configuration rather than adding a second configuration store.
- Assert shared durable outcomes and authorized transitions, not exact generated
  prose, incidental model-call counts or fixed repair counts. Use actual selected
  IDs/results; keep bounded waits and report genuine failures without forced success.
- Produce T94-compatible observations from actual native persisted runs/results
  and downstream consumption before cleanup. Retain partial/failure progress;
  checkpoints or HTTP model calls alone are not proof of integration. Do not
  duplicate the T94 journal implementation or build a telemetry subsystem.
- Keep separate alternative paths where necessary. Do not force every agent,
  conditional tool or recovery branch through one happy-path demo. Report agents
  not exercised rather than weakening the denominator or fabricating evidence.

## Detached worker instructions

Worktree: `D:\Flow-OpenMercato-worktrees\agency-dual-mode-harness`.
Branch: `work/agency-dual-mode-harness`.
The coordinator/user launches one bounded PowerShell worker on this task.

Read applicable AGENTS.md and team testing guidance first. Search existing
provider fixtures, teammate agent invocation and journey setup before refactoring.
Main checkout `D:\Flow-OpenMercato\App` is READ-ONLY to this worker. It contains
uncommitted T79 happy-only consolidation and Discord destination fixtures absent
from this clean branch. Inspect its scoped diff and those new fixtures, preserve
their intended behavior in your branch, and do not revert them to the older demo.
Do not copy unrelated main changes. Current owners may still add T93/T94 source;
read those contracts, but do not write their files or assume uncommitted code is
present in your branch. Identify any exact final wiring dependency in the handoff.

Known seams: T94 exposes `appendEvent` in
`.dev-docs/integrations/src/journal.mjs`; collect before
`deleteProductionJourneyRecords` in the demo cleanup. Reuse
`productionJourney/records.ts` for scoped persisted records; prove consumption
from saved lineage, not merely two runs sharing a case. T93's manual companion
also needs `postIntelligence.ts` to accept an optional `topicId`, preserving the
existing `TOP02` default, and to validate against that genuinely selected topic.
Do not remap a different customer's selection to the hardcoded fixture ID.

Do not edit launcher/profile scripts, Next/Compose configuration, agent production
implementations, locale files or report tooling. Request a precise seam change
instead. Do not modify the shared checkout, its dependencies, runtime or database.
Do not install dependencies, run tests/builds/generators/browser harnesses/servers,
invoke paid models, send real messages, publish, spawn workers, or perform Git
commits/merges/pushes. Read-only inspection and syntax checks are allowed. Leave
the implementation and focused checks ready for coordinator validation; missing
local dependencies are not a reason to link the shared node_modules or start setup.

Stop after this bounded source refactor, not an unlimited spec exploration. Hand
off changed files, preserved T79 changes, exact run commands/config requirements,
checks actually performed, remaining wiring and genuine blockers in conversation.

## Done when

The coordinator verifies one shared scenario selects the requested intelligence
mode without changing business execution, runs the fixture path against the owned
persistent runtime, and confirms the journal records actual native handoffs.
Live wiring must be ready and explicitly gated; paid execution is not authorized
and must remain labelled unproved. Agent completion alone does not close T95.
