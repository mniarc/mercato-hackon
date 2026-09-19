# T36 - Submit materials to the configured research process from the real portal

State: done (bounded portal caller; live analysis execution remains T26)
Depends on: T26's existing analysis intake contract
Owns: `ai-company/apps/mercato/src/modules/agency/frontend/[orgSlug]/portal/agency/materials/_components/MaterialSubmission.tsx`, its adjacent test, and `agency/i18n/*.json` material-analysis keys only
Sources: F40-1 material intake, F06-1 configured task activation, F55-1 scoped access; existing teammate Materials UI and `/api/agency/portal/materials` contract
Context: The API accepts `process:{kind:'analysis'}` and resolves staff-owned execution policy. The real form now exposes that existing contract; focused component checks and app typecheck pass at d74ad2edf. This is not paid analysis or whole-story acceptance proof.

## Deliver

- Add analysis to the existing process selector and submit exactly `{kind:'analysis'}`
  with the existing title/file multipart request. Keep intake and ToV behavior.
- Give a concise translated hint that this path accepts the existing analysis
  JSON material contract (order/source inputs); it is not arbitrary-file research.
- Display existing server errors and case/status navigation. Never ask the customer
  for execution budget, pipeline endpoint, server identity or approval flags.

## Done when

- The form can submit the analysis request, retains the uploaded file, and opens
  the real returned case. One focused component check covers the payload and error
  path; the coordinator integrates with the persistent app when runtime is free.

## Constraints

- This is a bounded caller integration, not paid-order activation or full F40-1.
  Do not add a portal, API, schema, executor, client payment gate or default limits.
- A live run needs existing staff configuration, enabled analysis execution and
  explicit approval for paid calls. Missing configuration is a reported server
  error, not permission to generate guessed policy or mutate the environment.
