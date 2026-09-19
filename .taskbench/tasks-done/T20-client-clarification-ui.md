# T20 - Let clients answer a saved clarification

State: done (bounded clarification UI)
Depends on: T16's integrated API (UI implementation may proceed before combined proof)
Owns: `ai-company/apps/mercato/src/modules/agency/frontend/[orgSlug]/portal/agency/cases/**`, `agency/i18n/**`
Sources: F40-1, F41-1, F42-1, F45-1, F55-1; existing teammate case-page contract

## Deliver

- Extend the real case detail with collocated components consuming persisted
  submission/reply APIs. Show the saved question, original reply and outcome;
  allow one clarification response with a retry-stable event ID.
- Keep deterministic intelligence explicitly labelled. Clients do not choose
  workers. Preserve existing status/history and native portal authentication.

## Done when

- A client can reload a saved clarification, submit its reply and see the persisted
  outcome. Focused UI checks cover pending/error/retry behavior; the coordinator
  extends the canonical journey rather than creating another demo path.

Five focused UI checks and the real headed journey passed, including reload before
and after reply. Major boundaries: [ADR-001](../../.dev-docs/adr/001-agency-feature-boundaries.md).

## Constraints

- No new backend, artifact approval, invented conversation history or competing
  review renderer. T17 is a read boundary, not the teammate HTML review contract.
- Coordinator owns shared exports, runtime, generation and integrated proof.
