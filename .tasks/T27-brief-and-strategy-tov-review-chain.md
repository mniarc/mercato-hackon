# T27 - Connect brief and strategy/ToV version review

State: active (brief review handoff T38/T39/T40; full acceptance and strategy pair remain pending)
Depends on: T24, T26, T22; teammate ToV document service
Owns: `agency_operations/lib/briefStrategyProcess/**`; narrow ToV process bridge
  Next bounded F24-1 invitation/response: `agency_operations/lib/strategyPairReview/**`,
  `agency/api/strategy-reviews/**`, `agency/components/strategy-review/**`;
  coordinator owns shared G schema, DI and native handoff.
Sources: F09-1, F09-2, F09-3, F10-1, F10-2, F10-3, F11-1, F11-2, F12-1, F12-2, F12-3, F20-1, F20-2, F21-1, F21-2, F22-1, F23-1, F24-1, F24-2, F25-1

## Deliver

- Next bounded F24-1 slice: show the exact strategy/ToV pair and route the original
  customer response into G through a native invitation. No implied pair acceptance
  or planning activation; those remain separate authorized effects.
- Parallel read-boundary slice: `agency_research/lib/strategyReview/**` exposes
  exact strategy/ToV versions, their shared persisted 5.4 QA, client projections,
  simulation/currentness and shared brief basis. Reuse teammate records; no
  approval mutation, new producer or calls into `agency_tov`. Coordinator owns
  public service exports/wiring and the later paired native invitation.
- Start with verified evidence → brief draft/QA → customer discussion → authorized
  exact-version brief acceptance; use T26 for targeted supplements and T22 for receipts.
- Bind strategy authoring and teammate ToV revisions to that accepted brief and
  actual strategy proposal; pair QA and the current complete pair gate precede planning.
- Reuse saved G directives and native customer waits. Communication drafts explain
  persisted state; neither discussion nor one ToV acceptance approves the whole pair.

## Done when

- Deliver the brief gate first, then the pair gate. Focused tests show stale/partial
  acceptance cannot advance the process and a valid exact current pair can.

## Constraints

- Do not rewrite teammate ToV or add its agents here. No second triage at F10-3/F25-1.
- Reuse teammate `agencyResearchService.run` through `4.2` for brief drafting/QA;
  our former brief-author and audit/brief QA scaffolds are retired.
- Brief-specific delivery proceeds independently through T38/T39/T40. T22's ToV
  invitation producer must not block this separate brief handoff.
  `agencyResearchService.getClientView` provides current Markdown, not that
  invitation. The teammate portal brief route still uses a customer-ID prefix
  ownership convention, whereas analysis uses a case UUID for `orderRef`; do not
  connect it by forging a prefixed ID or bypassing real case ownership. Agree the
  existing portal producer/eligibility seam before implementing acceptance gates.
