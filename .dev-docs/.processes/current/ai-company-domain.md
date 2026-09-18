# AI company domain vocabulary

The product models a marketing agency whose workforce includes human employees
and agentic workers. In the normal flow, agentic workers make marketing decisions
for assigned clients. The application routes work, enforces authority, and saves
evidence; it does not replace those decisions with hard-coded product logic.

These are domain concepts, not a requirement for one database table per noun.
Open Mercato identities remain canonical and our module stores references plus
the agency-specific relationships and work state it owns.

## Actors

- **Agency**: the operating organization and tenant boundary.
- **Agency client**: the agency's relationship with an Open Mercato
  customer/organization. It holds agency-specific status and settings without
  duplicating the platform customer identity.
- **Client contact**: an authorized Open Mercato contact/account acting for one
  agency client in the client portal.
- **Agency employee**: the agency's relationship with an Open Mercato user/staff
  identity. A human supervises work and handles explicit exceptions; routine
  agent decisions do not require automatic human approval.
- **Agent worker**: a stable agency capability/role backed by a native agent
  definition, not another user table or scheduler. It makes task-local marketing
  decisions within its authority; a workflow applies its typed outcome.
- **Client assignment**: authorizes an employee or agent worker to act on a
  client or case. It is distinct from identity and from an individual run.

## Work records

- **Work case**: the agency's client-facing business record joining client,
  materials and results to a native workflow instance. It is not a second
  execution lifecycle. Today's material case is not yet a paid order.
- **Material submission**: the immutable original client input: text/file
  reference, sender, timestamp, event ID, and case.
- **Work item**: one routed unit of work represented by native workflow steps,
  activities or human `UserTask`, not an agency taskboard/table.
- **Agent run**: a native orchestrator execution attempt, linked by exact ID to
  its workflow invocation. The deterministic baseline instead records no-op
  workflow output; it must not be presented as a live native agent run.
- **Agent decision**: a business choice made by an agent worker during a run,
  including its subject, selected option, rationale/evidence, and scope. A run
  may produce none, one, or several decisions.
- **Output artifact**: a versioned work product or reference produced by a work
  item or run.
- **Case transition**: the persisted state change caused by a completed work
  item, including its source run or human action.

## Responsibility boundary

- Client contacts submit materials and see only their client's cases and output.
- Agent workers make ordinary marketing choices for assigned clients.
- Agency employees observe, configure constraints, intervene on exceptions, and
  make only decisions explicitly reserved for humans.
- Open Mercato supplies identity, authorization, attachments, workflow/run
  persistence and human assignment. Agency operations owns case relationships,
  business routing and links to decisions/evidence, not copies of those records.

Deterministic intelligence is allowed for scaffolding: fixed, explicitly labelled
typed outcomes can stand in for a model. Identity, scoped APIs, storage, workflow
transitions and employee/client surfaces remain real. Keep these fixtures out of
the live provider path; missing credentials or failed execution is not success.

The implementation anchor is the app module `agency_operations`. Client identity
comes from `customers` and `customer_accounts`; employee identity comes from
`auth` and `staff`. The normal Open Mercato `/backend` is the employee workspace,
and client pages live below `frontend/[orgSlug]/portal/agency/`.

## Reference process and extensions

`client input -> stored case/material -> native workflow -> typed agent outcome
-> domain action/result -> client status or employee exception`

The current reference lane is supplied normalized ToV corpus, not arbitrary-file
understanding. `agency_tov` owns its corpus, research and versioned documents;
the agency bridge keeps their exact references. OpenRouter configuration belongs
to [agent-runs.md](agent-runs.md), never individual frontend/provider clients.

| Need | Agency-owned seam | Reuse; do not rebuild |
| --- | --- | --- |
| Submit/follow a case | Scoped intake and client-safe query contracts | `customer_accounts`, private attachments, teammate `agency` portal |
| Run a capability | Typed input/output and workflow activity/agent definition | `workflowDefinitionAuthoring`, async activities, `agentRuntime`; native process start when using ProcessDefinition |
| Delegate research | Agent's declared `subAgents` | Native `delegate_agent`: research-only children, one level |
| Ask the client | Scoped reply tied to case/request/version | `WAIT_FOR_SIGNAL` / DI `signalHandler`; waiting is not employee escalation |
| Resolve an exception | Reason, evidence, allowed decision and return point | `UserTask`, claim/reassign/complete and `/backend/work-inbox` |
| Show results | Client-safe artifact references, separate staff context | Existing ToV document versions and scoped case reads |

For a new capability, own a small module-local service and typed outcome, connect
it to the existing workflow, and expose only the needed client/staff contract.
Agents propose/research; domain commands or workflow effectors perform writes.
Use native workflow execution identity/grants, never a customer ID as a staff
principal. No new generic dispatcher, ticket engine, queue or mirrored status.

## Next customer and employee processes

Stories F40–F55 guide these slices; they are not a mandate to build every branch.

1. **Customer service/triage:** receive one replay-safe submission, preserve its
   original and references, then let an agent classify it once: question,
   material, change, acceptance, problem or hold. Save a typed disposition and
   rationale; downstream workers consume it rather than reclassifying.
2. **Client response/approval:** clarification waits for the client. Acceptance
   binds an authorized contact to the exact shown document version; “approve but
   change” is a change request, not approval of unseen future content.
3. **Employee exception:** unresolved authority/scope/failure or explicit
   attention policy creates a native task. A human resolves only permitted
   choices; resume the affected step, not the entire case/order. Routine agent
   work and ordinary waiting for the client need no human approval.

Only changes requiring it invoke scope/impact assessment; do not route every
message through all stages. “Ticket” is a product label for a case/submission or
human task, not a reason for another persistence engine. Native `messages` has
threads/object links but a staff `senderUserId`; assess its customer adapter
before reusing it, and never coerce customer identity into that field.

Order/payment activation, publishing, revision impact graphs and external-channel
delivery are later slices, not implicit effects of uploading a file. Current
implementation and demonstrated acceptance stay in T10/T12/T14 and the shared
T04 proof; future submission/reply seams are T15/T16.
