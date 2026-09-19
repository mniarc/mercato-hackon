# ADR-003 - Spec-mapped agency workers and process handoffs

Status: accepted scaffold architecture; business process completion is not implied.
Sources: all 102 stories in [user-stories](../../.specs/user-stories).

## Decision

Keep replaceable judgment workers under
`ai-company/apps/mercato/src/modules/agency_operations/agents/<role>/`, with
`contract.ts`, `prompt.ts`, and `definition.ts` together. Author native
`agent_orchestrator` `DefineAgentInput` data with typed outcomes. The five agency-owned
role definitions are side-effect-free: importing them must not call `defineAgent`
or register anything. The module's `ai-agents.ts` is the sole native registration
point. It is empty by default; explicit `OM_AGENCY_TRIAGE_MODE=fixture|live`
readiness registers the implemented client-triage worker through native `defineAgent`.
The legacy enabled flag remains fixture-only. The other four role definitions
remain inactive until their owning slice wires authorized inputs, persistence,
bounds, and effects. Activation alone is neither runtime proof nor approval to spend.

Execute through native workflow `INVOKE_AGENT`, or native DI `agentRuntime.run`
where a genuine domain pipeline needs it, as the teammate ToV pipeline does.
Do not add `registerAgencyAgent`, `runAgencyWorker`, a generic agency dispatcher,
executor, or shadow runtime. The lower-level `ai-assistant` / model SDK behind
native execution is platform implementation, not our integration API; do not
bypass the orchestrator with direct SDK callbacks. This chosen agent execution
path requires Enterprise. The deterministic module baseline remains usable
without Enterprise, but is not agent-execution parity.

Native workflows own execution state; trusted domain actions apply results.
An agent proposes judgment, not authority to accept a document, record payment,
publish, close a case, or resume an exception. Deterministic gates remain code.
Use existing native delegation only for a real supported subtask, not a generic
agency dispatcher. Open Mercato retains identity, ACL, attachment, workflow,
run-record, and human UserTask infrastructure; agency-specific rules remain ours.

Prompts and typed contracts can change within their role folder without changing
portal or workflow internals. Native agent configuration and the shared server
`OM_AI_PROVIDER` / `OM_AI_MODEL` configuration remain the configuration seam;
OpenRouter credentials stay private. Do not put providers or model defaults in
each worker. Editable prompts are **not** F60's approved, versioned offer,
process, limits, and document templates. Those must be supplied and pinned before
the corresponding execution; a scaffold must not invent missing business values.

## Judgment roles and typed handoffs

At activation, the owning process must scope inputs to the client/case and exact
supplied versions. The remaining agency-owned role outputs are research/draft scaffolds: the
native `research` envelope carries typed `data` that enriches context, not an
approved action or customer document. A business-language recommendation is not
a native `proposal` envelope. Native proposals carry actions/options for native
disposition and effectors; native `artifact` results reference produced files.
Changing a role to either requires its real process contract, not merely renaming
a schema. None of these runtime result kinds is customer approval. Source
references mean supplied evidence, not a claim that disabled workers already
fetch websites or read attachments.

| Role / implementation owner | Source anchors | Input → output / next owner |
| --- | --- | --- |
| `sales-advisor` | F01-2 | Approved offer + question → grounded explanation or clarification; purchase action remains deterministic. |
| Source research — `agency_research` | F06-2, F06-3; F11-1 supplementary handoff | Step 3.2: `page_extractor`, `proof_builder`, `content_seeder`, `conflict_finder`, `coverage_assessor` → persisted source register. |
| Brand audit — `agency_research` | F07-1; F11-1 supplementary handoff | Step 3.3: `audit_mapper`, `audit_voice`, `audit_gaps_assets` → communication audit. |
| Market research — `agency_research` | F07-2, F07-3; F11-1 supplementary handoff | Steps 3.4–3.5: `competitor_selector`, `competitor_card`, `competitor_channels`, `competitor_synthesizer` → competitor comparison. |
| Findings and research QA — `agency_research` | F08-1, F08-2, F08-3 | Steps 3.6–3.8: `field_mapper`, `question_writer`, `readiness_assessor`, `research_qa` → findings, QA and code-owned frozen package. |
| Brief and brief QA — `agency_research` | F09-1, F09-2, F09-3; F11-2 supplementary handoff | Steps 4.1–4.2: section workers `brief_writer.offer_audience_direction`, `brief_writer.promise_voice`, `brief_writer.channel_success_assets`, then `brief_qa` → versioned draft, QA and customer-safe projection; customer acceptance remains separate. |
| Strategy/ToV and pair QA — `agency_research` | F21-1, F21-2, F22-1, F23-1 | Steps 5.2–5.4: section workers `strategy_writer.choice_tension_uvp`, `strategy_writer.proof_messages`, `strategy_writer.pillars_channel_boundaries`, then `tov_writer`, `strategy_qa` → versioned proposals and pair QA; native client consent remains a separate handoff. |
| Content plan and QA — `agency_research` | F26-2, F27-1 | Steps 6.2–6.3: `plan_writer.topics`, `plan_writer.balance_recommendation`, `plan_qa` → versioned plan and QA; selection/post instruction are code-owned steps, not another agent. |
| Post writing/editing — `agency_research` | F30-2, F31-1, F31-2 | Steps 7.2–7.3: `post_author`, `post_editor` → versioned draft and editorial QA; targeted research, customer changes and exceptions still need their real handoffs. |
| Package checks — `agency_research` code | F38-1, F38-2 | `research/steps/package.ts` + `research/packaging.ts` assemble existing outputs, project verified takeaways and check completeness/closure; no generic agency QA worker or new customer package approval. |
| `client-triage` | F42-1, F42-2 | Original submission + scoped context → intents/mixed parts, rationale, and uncertainty; authorized routing is separate. |
| `scope-assessment` | F43-1, F43-2 | Triaged change + pinned offer → in-scope, clarification, outside-scope, or employee-exception proposal; not impact analysis. |
| `change-impact` | F44-1, F44-2 | In-scope decision + actual dependencies → affected fields/versions/tasks, unchanged parts, and proposed allowed return point. |
| `client-communication` | F10-1, F10-2, F24-1, F27-2, F32-1, F34-2, F35-1, F38-3, F38-4, F40-1, F41-1, F45-1, F49-2 | Saved grounded outcome + permitted audience/context → explanation, question, or delivery draft; never a second triage or invented promise. |

Teammate `agency_tov` remains outside this directory. Its source scout, batch
analyst, profile synthesizer, and brand synthesizer remain unchanged; the agency
process integrates through its public research/document service, not extracted
or copied ToV internals. Corpus research alone does not complete F22-1: the
strategy process must bind the accepted brief, strategy proposal, ToV revision,
and pair QA. The teammate `agency` portal remains the customer surface.

Teammate `agency_research` owns source research, audit, competitor comparison,
findings/QA, brief drafting/QA, strategy/ToV, planning and post production/QA.
Its publication documents and package checks are deterministic code, not agents.
Agent names in its rows above carry the `agency_research.` prefix and are
registered by that module's `ai-agents.ts` from `lib/agents/`. See the teammate's
[workflow reference](../../ai-company/apps/mercato/src/modules/agency_research/WORKFLOW.md)
for the detailed agent inventory and production chain; definitions remain the
authority for exact identifiers.
The overlapping agency research and production role folders are removed, not
aliased or copied; only sales explanation, client triage, scope assessment, change
impact and client communication remain in the agency definition catalog.
Resolve `agencyResearchService` through its public `lib/contracts/agencyResearch`
contract. `run` accepts a trusted server identity, scoped order data and `through`
(`3.2`, `3.5`, `3.8`, `4.2`, `5.4`, `6.7`, `7.3`, `8.7`, `9.3`); it returns exact
task/document/native-run references and QA outcomes. `status` exposes persisted
progress; `getClientView` exposes the
customer-safe document projections. T26–T32 own the agency case/workflow handoffs,
including supplementary research and customer review; service availability does
not prove those interactions complete. Do not register competing research or
production workers in `agency_operations`, or call individual teammate agents to
bypass their evidence, QA and persistence pipeline.
Available checkpoints are not authorized end-to-end business completion:
simulated selection, missing exact-version consent, unexecuted publication and
undelivered packages remain explicit integration gaps. Do not activate an agency
placeholder to conceal those gaps or change `agency_tov` to resolve them.

The opt-in case adapter lives in `agency_operations/lib/analysisProcess/`.
Authorized staff pin stage, spend setting and product selection in a native
workflow definition. Portal intake chooses only `analysis`, stores private
material and links the exact workflow version; the employee view reads its saved
result. Partial research waits rather than claiming delivery or replaying the
whole pipeline. Targeted F11 return and live runtime proof remain outstanding.

## Complete source coverage and delivery owners

This is a **mapping of 102 stories**, not a statement that 102 stories work.
Every source ID appears below. Worker anchors above overlap intentionally.
Tasks own acceptance and current delivery state, not this ADR.

| Domain / exact stories | Process boundary and delivery task |
| --- | --- |
| Sales: F01-1, F01-2, F02-1, F02-2, F03-1, F03-2 | Sales explanation is judgment; offer display, purchase validation, terms, order and payment initiation/retry are deterministic. [T25](../../.tasks/tasks-done/T25-paid-order-process-bootstrap.md). |
| Payment/handoff: F04-1, F04-2, F04-3, F05-1, F05-2 | Authenticate/match/deduplicate payment; notify and start one paid process, or raise an owned exception. [T25](../../.tasks/tasks-done/T25-paid-order-process-bootstrap.md). |
| Evidence: F06-1, F06-2, F06-3, F07-1, F07-2, F07-3, F08-1, F08-2, F08-3 | Activate permitted tasks; sources → audit/market comparison → findings/QA → pinned package. [T26](../../.tasks/T26-source-grounded-analysis-package.md). |
| Brief: F09-1, F09-2, F09-3, F10-1, F10-2, F10-3, F11-1, F11-2, F12-1, F12-2, F12-3 | Draft/QA → customer discussion through G → targeted supplement if needed → exact-version consent. F10-3 executes saved G routing, never re-triages. [T27](../../.tasks/T27-brief-and-strategy-tov-review-chain.md), with T26 for supplementary evidence. |
| Strategy: F20-1, F20-2, F21-1, F21-2, F22-1, F23-1, F24-1, F24-2, F25-1 | Accepted brief → strategy + teammate ToV → pair QA → current-pair consent gate; F25-1 applies saved G routing. [T27](../../.tasks/T27-brief-and-strategy-tov-review-chain.md). |
| Planning: F26-1, F26-2, F27-1, F27-2, F27-3, F28-1, F29-1, F29-2 | Accepted dependencies → plan/QA → current plan plus one existing topic selection → deterministic post instruction. [T28](../../.tasks/tasks-done/T28-plan-review-and-post-instruction.md). |
| Post: F30-1, F30-2, F31-1, F31-2, F32-1, F32-2, F32-3, F33-1, F33-2 | One draft/QA → targeted correction/research → exact text acceptance; publish consent is separately bound to version and target. [T29](../../.tasks/T29-post-production-and-version-review.md). |
| Publication **proposal**: F34-1, F34-2, F35-1, F36-1, F36-2, F36-3, F36-4, F37-1, F37-2, F37-3 | Deterministic configuration, consent, preflight, atomic reservation/send-start, revocation handling, reconciliation, provider proof. No LLM publisher. [T31](../../.tasks/T31-proposed-publication-and-reconciliation.md). |
| Delivery/closure **proposal**: F38-1, F38-2, F38-3, F38-4, F39-1 | Completeness/quality review → client-safe package → actual sharing/retry → gated closure linked to original payment. [T32](../../.tasks/T32-proposed-delivery-and-closure.md). |
| Shared customer intake/context: F40-1, F40-2, F41-1, F41-2 | Preserve original submission, prepurchase context, exact authorized approval target. Existing T15/T16/T20 cover bounded intake/clarification; T22 owns actual review invitation/receipt; [T30](../../.tasks/T30-shared-scope-impact-and-routing.md) extends G. |
| Shared judgment/routing: F42-1, F42-2, F43-1, F43-2, F44-1, F44-2, F45-1 | Triage → scope → impact only where needed; save and authorize the resulting directive. T19 activates the first native worker; [T30](../../.tasks/T30-shared-scope-impact-and-routing.md) extends beyond answer/clarify. |
| Shared publication/postdelivery handling: F46-1, F46-2, F47-1, F47-2 | Hold/reconcile publication; distinguish delivery error from new need. Unsupported published-content repair is not fabricated. [T30](../../.tasks/T30-shared-scope-impact-and-routing.md), T31/T32 adapters. |
| Employee exceptions: F48-1, F49-1, F49-2, F50-1, F50-2 | Create owned native UserTask → authorized human decision or customer-question wait → resume permitted originating step once. T21 extends existing T05 inbox. |
| Execution/configuration: F51-1, F60-1 | Enforced task bounds and approved pinned standards/templates; no invented prices, counts, limits, or routes. [T24](../../.tasks/T24-versioned-product-execution-config.md), T19. |
| Operational platform: F52-1, F53-1, F54-1, F55-1 | Real case/process projection, dependency/version lineage, and separate record authority. Enterprise is required for the selected native agent path, not the deterministic baseline; this does not claim full OSS agent parity for F54-1. [T33](../../.tasks/T33-operational-process-view-and-demo.md) composes actual domain records; each owning task enforces its write boundary. |
| Demo evidence: F56-1, F57-1, F58-1, F59-1 | Explicit earlier execution, genuine branch choice/current consents, provider proof, honest fallback. [T33](../../.tasks/T33-operational-process-view-and-demo.md); presentation does not authorize missing effects. |

Counts: sales/payment/evidence/brief/strategy **40**; plan/post/publication/closure
**32**; shared customer/employee/execution/platform/demo/configuration **30**.
F34–F39 are explicitly proposals in the source, not settled policy. The demo
names Discord, but that does not settle a generic production channel contract.

## Runtime boundary and next sequence

The current bounded foundation persists intake, deterministic answer/clarify,
clarification replies, and employee attention using real platform infrastructure
(T15/T16/T20 and earlier milestones). Triage's opt-in implementation connects native
workflow invocation, workflow-owned grants, post-commit asynchronous dispatch,
and authorized-result projection. The canonical headed demo proved native execution
and employee exception return with local intelligence; paid bounds remain T24.
This is not proof of a live model's quality or full F51/F60 coverage. T17 still needs
positive persisted-artifact runtime proof;
T22 needs a real version review receipt.
None is made complete by adding the role folders.

Proceed T24 + T19 first at their shared activation seam; independent paid-order,
evidence, and operational read-model work can follow their own dependencies.
Then connect one source-grounded path through brief, strategy/ToV, plan, and post,
reusing G and E instead of parallel lifecycle engines. Proposal publication and
closure require confirmed policy and a real adapter before activation.

The client waits for clarification/approval, an employee owns a genuine exception,
and deterministic transitions consume saved decisions. Numeric product settings
(including any price, topic count, or technical budget), templates, and allowed
return paths require agency configuration. A missing value blocks its specific
execution with a reason; neither a prompt nor a demo fixture supplies authority.
