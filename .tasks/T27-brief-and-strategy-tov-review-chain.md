# T27 - Apply client answers and regenerate the brief

State: active (scoped research/G integration approved; prerequisite for T58)
Depends on: existing G submission/disposition, T38/T39/T40 review, teammate brief producers;
T26 for targeted evidence supplements, T24 for authorized execution limits
Owns: research-owned answer application and phase-only brief regeneration; existing
`agency_operations/lib/briefStrategyProcess/**` native handoff. Coordinator assigns
new exclusive paths and shared service/G contracts before implementation.
Sources: F09-1, F09-2, F09-3, F10-1, F10-2, F10-3;
F11-1, F11-2 evidence-return boundary; F12-1, F12-2, F12-3 acceptance and current-analysis requirements

Existing brief invitation, response receipt, acceptance/readiness and strategy-pair
seams are reused (T38–T43, T47/T48), not rebuilt. Their existence does not prove
that a client's missing answers update the brief.

## Observed gap

`agency_research/lib/research/steps/findings.ts` deliberately rejects model-invented
client decisions. `brief.ts` copies decisions from the persisted findings map;
`briefQa.ts` keeps unanswered required decisions at `needs_client_data`.
`briefAcceptance/accept.ts` correctly requires exact positive QA. Current public
research contracts expose initial execution/review/acceptance, but no production
application of the saved client's answers into findings and targeted brief rerun.
Receiving a comment or clarification therefore does not close this recovery loop.

## Deliver

- Consume one authorized saved G directive tied to the original customer response,
  case, exact brief and questions. Agent interpretation proposes the answered fields;
  trusted code binds updates to that source. No second triage or invented decisions.
- Apply answered values to versioned findings, retaining unanswered gaps and source
  references. Reuse teammate 4.1/4.2 to create a new version of the same brief,
  preserving unaffected content and previous history, without inherited approval.
- Keep findings/analysis dependencies coherent with the 3.8 package required by
  strategy readiness. A genuine evidence request uses T26's bounded 4.5 → 3.7/3.8
  return; do not rerun the entire analysis or stamp a successful freeze.
- Show the real next state in the existing portal: further questions for unresolved
  client gaps, agent repair for drafting errors, or a fresh exact-version invitation
  after positive QA. Answer receipt alone neither approves nor starts strategy.

## Done when

- One connected recovery begins with a genuinely produced `needs_client_data`
  brief, takes the client's answers through G, and produces a new QA-assessed brief
  with the answers visible. A sufficient answer enables a fresh invitation and
  subsequent explicit acceptance; an unresolved gap remains a question.
- A focused replay/current-version check proves the same directive cannot create
  duplicate updates or approve stale/new content. T58 then consumes the genuine
  accepted brief and current analysis; no separate duplicate demo matrix.

## Constraints

- No seeded answered findings, accepted brief/pair, receipts or forced positive QA
  to claim this path works. Substitute intelligence only in the connected proof.
- No replacement research engine, portal or ToV rewrite; reuse native tasks and
  teammate producers. Do not turn an in-scope correction into checkout, a round
  limit, or routine staff approval. Missing execution authorization stays explicit.
