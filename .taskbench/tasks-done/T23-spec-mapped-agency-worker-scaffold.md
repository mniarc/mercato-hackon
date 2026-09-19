# T23 - Map agency workers and scaffold replaceable definitions

State: done (bounded worker mapping/scaffold and duplicate-role retirement)
Evidence: ADR-003 accounts for all 102 source story IDs; only five agency-owned definitions remain, with teammate research/production call sites preserved. Existing scaffold suite passed 6/6 and full app TypeScript check passed on 2026-09-19. This completes the mapping/scaffold task, not the mapped stories or live worker activation.
Sources: all `.specs/user-stories` domains; exact story-to-role mapping in ADR-003
Owns: `agency_operations/agents/**` and ADR-003 worker ownership map;
coordinator owns shared registration and integration

## Deliver

- Follow-on after teammate phases 5–9 merge: retire unused strategy-author,
  content-planner, post-copywriter, post-editor and overlapping quality-reviewer
  definitions after verifying real teammate call sites. Strategy/plan/post QA
  and deterministic package checks remain in `agency_research`; missing business
  gates are integration work, not reasons to preserve competing agent scaffolds.
  Update remaining-role checks and ADR ownership without claiming story completion.
- Read every story domain; distinguish judgment workers, deterministic platform
  actions, customer waits and employee decisions. Group responsibilities rather
  than generating one agent per story. Preserve teammate portal/ToV ownership.
- Record one broad architecture/coverage map with source IDs, inputs, outputs,
  handoffs, native reuse and honest implemented/scaffold/missing boundaries.
- Collocate agency-owned worker prompts, native definitions and typed contracts
  under per-role directories. Keep one native discovery entry point, shared
  model configuration, no second dispatcher, agent catalog database or executor.
- Author side-effect-free native `agent_orchestrator` `DefineAgentInput` data;
  keep unfinished roles unregistered; preserve the existing opt-in client-triage
  registration. Execution
  belongs to native workflow `INVOKE_AGENT` or native DI `agentRuntime` for a real
  domain pipeline, not an agency wrapper/dispatcher or direct SDK callback.
- Leave `agency_tov` untouched. Remove the unshipped direct-SDK triage adapter and
  speculative generic registration/execution wrappers; retain only its pure domain
  projection. Label current research outcomes as drafts, not native action/file
  results or customer approvals. Enterprise is required for the selected agent
  execution path; the deterministic baseline is separate.
- Link genuinely missing connected slices to concise tasks, reusing T19/T21/T22.
  Never label placeholder intelligence or proposed wiring as completed processes.

## Done when

Every story is accounted for in the map (including deterministic and external
ownership), scaffold contracts typecheck, and a focused check covers definition
identity/role coverage without paid calls or a new database/demo harness.
Live registration and business side effects remain gated by the owning slice.
