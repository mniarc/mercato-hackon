# ADR-001 - Agency operations and teammate feature boundaries

Status: accepted

## Decision

Own the agency's work routing and employee attention layer in `agency_operations`,
not a replacement CRM, workflow engine, customer portal, or tone-of-voice system.
Domain terms remain in [the domain vocabulary](../.processes/current/ai-company-domain.md).

- **Our feature:** tenant-scoped cases, trusted material intake, stable worker
  assignment, the workflow bridge, and self-contained employee case UI/API.
  The first worker is deliberately a deterministic no-op; its execution and
  saved workflow evidence are real.
- **Open Mercato:** customer/staff identities, authentication/ACL, private
  attachments, persistence, workflow/run records, and human `UserTask` inbox.
  Reference platform IDs; do not duplicate its entities or taskboard.
- **Teammate customer portal (`agency`):** client-facing offer/order experience.
  Its integration should call a narrow trusted intake contract after resolving client identity;
  our module does not own its pages or authentication adapter.
- **Teammate research (`agency_tov`):** corpus, tone research, grounding and
  versioned documents. Connect through a small artifact/run reference seam,
  not imports into research internals or copied tone logic. Enterprise agents
  are optional for the core no-op slice and explicitly gated for this lane.

## Implemented boundary and pending connections

Intake, deterministic workflow, and employee case surfaces exist on main.
[T04](../../.tasks/T04-prove-real-vertical-slice.md) owns the remaining full-browser
proof; feature presence is not a completed-demo claim.

The merged portal currently builds an in-memory order summary; it does not yet
persist an order, call intake, or trigger a paid-case workflow. ToV's baseline and
persistence implementation are merged; schema activation and durable case-to-ToV
wiring remain separate integration work.
Neither teammate feature supplies [human escalation](../../.tasks/T05-real-human-escalation-inbox.md).

## Consequence

Reuse teammate implementations and platform contracts before adding code. Keep
portal wiring, research-artifact wiring, and human escalation as explicit next
capabilities, not implicit promises of the current slice. A Git merge brings in
code; it does not by itself connect these domains.
