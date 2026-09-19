# T22 - Connect a real version-bound review invitation

State: blocked (producer handoff)
Depends on: T15, T17
Owns: agency review invitation/receipt adapter; teammate owns review rendering
Sources: F24-1, F24-2, F41-1, F45-1, F53-1, F55-1; teammate portal spec section 10

## Deliver

- First establish one real KLI-TOV review invitation tied to case/client/exact
  version and native portal task, with the teammate's immutable HTML projection.
  T17's safe JSON is not that projection or a review entitlement.
- Then connect the teammate `/api/agency/cases/{caseId}/requests` handoff:
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
Do not implement the full pair gate until its real process prerequisites exist.

Missing handoff: an eligible case/client/exact version plus teammate-owned immutable client HTML. Current ToV provides JSON/Markdown; `frontend2` supplies the review consumer, not the producer. Do not substitute a renderer or infer eligibility from brand-wide current version.
