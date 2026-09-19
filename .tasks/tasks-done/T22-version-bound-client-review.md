# T22 - Connect a real version-bound review invitation

State: done (exact research strategy/ToV pair review; legacy T17 remains separate)
Depends on: T15; delivered strategy execution and paired review/acceptance contracts
Owns: agency review invitation/receipt adapter; teammate owns review rendering
Sources: F24-1, F24-2, F41-1, F45-1, F53-1, F55-1; teammate portal spec section 10

## Deliver

- Establish one real strategy/ToV pair invitation tied to case/client/exact
  versions and native portal task, with immutable rendered client projections.
  T17's safe JSON is not that projection or a review entitlement.
- Connect the teammate `/api/agency/strategy-reviews/{taskId}` handoff:
  persist original comment/decision, actor, version and retry-stable event ID;
  server code checks the invitation's permitted current state and ownership.

## Done when

- A real invited version can be read and its client decision received once;
  foreign/stale/uninvited targets cannot become authorized approvals. Reuse the
  teammate frontend and existing document storage; no second renderer/chat engine.

Receipt or partial ToV acceptance is not completed strategy+ToV pair approval,
publish consent or planning authorization. F24 requires the shown immutable pair,
post-QA state and valid brief for that domain transition. Brand-scoped
`document.currentVersionId` alone does not establish the case's review state.
The pair gate must retain its real process prerequisites.

The former producer-handoff blocker is resolved: `strategyExecution/reviewHandoff.ts`
invites the actual produced strategy/ToV UUID pair through `strategyPairReview`;
its service reuses research `getStrategyReview`/`getStrategyPairAcceptance`, the
existing Markdown renderer and native customer tasks. The teammate
`StrategyPairReview` component reads/responds through
`/api/agency/strategy-reviews/{taskId}`; `strategyPairApproval` applies the exact
saved decision. T17's separate legacy JSON endpoint does not drive this flow.
Connected fixture proof belongs to TC-AGENCY-002, not a claim of paid-model proof.

Verification evidence: the full headed TC-AGENCY-002 journey recorded in
`ef3b5390d` reads the produced exact pair and submits its real customer decision
through the native review/G path before planning and post production. Focused
`strategyPairReview` checks cover native visibility, stale/mismatched pairs,
replay and immutable snapshots. This closes the invitation/receipt boundary,
not T47's separate partial-decision continuation or full F24/F41/F45 stories.
