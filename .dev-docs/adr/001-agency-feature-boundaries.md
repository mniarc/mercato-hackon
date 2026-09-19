# ADR-001 - Agency operations and teammate feature boundaries

Status: accepted

## Decision

Own the agency's work routing and employee attention layer in `agency_operations`,
not a replacement CRM, workflow engine, customer portal, or tone-of-voice system.
Domain terms remain in [the domain vocabulary](../.processes/current/ai-company-domain.md).

- **Our feature:** tenant-scoped cases, trusted material intake, stable worker
  assignment, the workflow bridge, and self-contained employee case UI/API.
  The deterministic baseline saves real workflow evidence; the native research
  lane adds exact agent-run/document references without another lifecycle.
- **Open Mercato:** customer/staff identities, authentication/ACL, private
  attachments, persistence, workflow/run records, and human `UserTask` inbox.
  Reference platform IDs; do not duplicate its entities or taskboard.
- **Teammate customer portal (`agency`):** client-facing offer/order experience.
  Its adapter calls narrow intake/query contracts after resolving customer
  identity. We may connect these seams in coordination with the owner, but do not
  replace their frontend or duplicate its authentication.
- **Teammate research (`agency_tov`):** corpus, tone research, grounding and
  versioned documents. Connect through a small artifact/run reference seam,
  not imports into research internals or copied tone logic. Enterprise agents
  are optional for the core no-op slice and explicitly gated for this lane.
- **Teammate audit/research (`agency_research`):** source collection and its
  versioned evidence pipeline. Agency operations owns the case/workflow handoff
  through `agencyResearchService`, not duplicate research agents or storage.

## Integrated feature boundaries

The real customer portal calls scoped intake and case-query services. Native
attachments and workflows connect that entry point to employee case/detail and
material access. Explicit escalation creates a separate native attention workflow;
employees claim and complete its UserTask through the platform inbox. The original
portal-to-employee journey is demonstrated, not a substituted frontend/backend.

The portal's offer/order preview and task-review demo do not create paid orders
or authoritative approvals. Real intake does not imply either business event.
ToV research/persistence remains teammate-owned; its scoped server service and
asynchronous case workflow return exact run/document-version references. This
bridge is implemented, but live model proof is distinct from deterministic proof.

## Process extension boundary

`WorkflowInstance` owns execution state. Case records carry agency relationships
and references; native activities/runs and `UserTask` supply execution and human
assignment. A customer-service “ticket” does not introduce a second task engine.
Agent workers make marketing decisions as typed outcomes; trusted domain actions
apply them. Customer clarification/approval waits via workflow signals; employee
tasks are for genuine exceptions, not every decision or waiting customer.

Client submissions preserve original content and event identity. Replay returns
the saved record/outcome instead of reclassifying or starting another workflow.
The first worker supports explicitly deterministic answer/clarify routing; other
typed intents do not silently authorize business effects. A clarification reply
and exact-version artifact approval are separate contracts, not interchangeable
signals. Client adapters resolve permitted native wait targets server-side.

Artifact reads reference teammate-owned versions, with client-safe source-backed
projections. A linked version does not itself establish a review invitation,
current case version, approval, or a completed multi-document approval gate.

Domain workers use `agent_orchestrator` `DefineAgentInput` / `defineAgent`, native
workflow `INVOKE_AGENT`, or the native DI `agentRuntime` when a genuine domain
pipeline needs it, plus the shared server OpenRouter configuration. This selected
execution path requires Enterprise; the deterministic baseline still works without
it and is not an equivalent OSS agent executor. ToV is an example of native usage,
not code to extract, copy, or import as our runtime. No agency registration/run
wrapper, dispatcher, or direct lower-level SDK execution path is needed. See the
[worker map](003-agency-worker-and-interaction-map.md) for authoring and activation.
Use delegation only for a genuine supported research subtask. Declared native
budget options must not be confused with enforced limits on the selected path.
Deterministic intelligence may scaffold these seams, but platform persistence,
access and transitions remain real. Reusable extension points live in the domain
vocabulary linked above.

## Consequence

Reuse teammate implementations and platform contracts before adding code.
Treat live execution, authorized version review and exact-step exception recovery
as separate capabilities with explicit evidence, not promises inferred from a
Git merge or scaffold. Task records own remaining delivery acceptance; this ADR
captures the feature boundaries, not a running implementation log.
