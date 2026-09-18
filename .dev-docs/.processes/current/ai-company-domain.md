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
- **Agent worker**: a stable, module-owned agency actor with a role/department,
  status, and work assignment. It processes work and, once enabled, makes
  task-local marketing decisions for the client within its authority.
- **Client assignment**: authorizes an employee or agent worker to act on a
  client or case. It is distinct from identity and from an individual run.

## Work records

- **Work case**: the client engagement/process instance. It joins the client,
  materials, work items, current state, and results.
- **Material submission**: the immutable original client input: text/file
  reference, sender, timestamp, event ID, and case.
- **Work item**: one routed unit of agency work with inputs, dependencies,
  assignee, status, and expected output.
- **Agent run**: one execution attempt by an agent worker for a work item, with
  saved input, output, timing, and outcome evidence.
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
- Open Mercato supplies real identity, authorization, persistence, task/workflow,
  and UI extension seams. The AI-company module owns agency relationships,
  assignments, work records, decisions, and evidence.

For the first vertical slice, the agent worker is real but its executor is a
deterministic no-op. It records a run and advances the case without making an
`Agent decision`. Later behavior can replace that executor while preserving the
actor, work-item, run, evidence, and authorization model.

The implementation anchor is the app module `agency_operations`. Client identity
comes from `customers` and `customer_accounts`; employee identity comes from
`auth` and `staff`. The normal Open Mercato `/backend` is the employee workspace,
and client pages live below `frontend/[orgSlug]/portal/agency/`.
