# T22 - Connect a real version-bound review invitation

State: implemented through the exact research strategy/ToV pair review
Depends on: T15, T17
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
