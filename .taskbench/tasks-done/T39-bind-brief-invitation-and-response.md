# T39 - Bind brief review invitations and responses to the real case

State: done (bounded invitation/response: native headed journey displayed the teammate viewer and preserved one exact response/replay; 9eb0153c4)
Depends on: T38 exact projection; T40 existing review consumer
Owns: backend agent: `agency_operations/lib/briefStrategyProcess/**`, `agency/api/cases/[id]/requests/**`, `agency/api/reviews/[id]/**`; frontend agent: `agency/components/AgencyTaskPage.tsx` and adjacent loader tests; coordinator owns shared workflow/registration and G request schema
Sources: F10-1, F10-3, F41-1, F55-1; teammate DocumentReview and native portal UserTask

## Deliver

- Produce a native customer task from the actual case/customer contact and exact research version, using the existing review UI and a producer-side Markdown-to-HTML serializer already available in the repository.
- Use one reusable native definition and an instance-owned immutable snapshot. Native task-detail `formKey: 'agency.brief-review'` selects the scoped `/api/agency/reviews/{taskId}` read, not per-record definitions or platform-wide schema interpolation. Consumer intersects native actability and projection `canRespond`.
- Map exact clean QA to ready_for_review; client-data-needed to needs_review (commentable, not acceptable). Keep stale/uninvited versions non-actionable and do not expose internal QA findings.
- Persist original response, actor, exact version and stable event ID through existing G intake. Reject foreign, stale and uninvited targets. Native workflow owns waiting; no second triage or direct approval from a click.

## Done when

- Real invitation renders in teammate portal; one response is received once and linked to its version, with focused ownership/replay proof and the existing persistent-runtime demo extended only at this seam.

## Constraints

- No ToV rewrite, customer-ID-prefix ownership fiction, parallel task engine or claim of full F12 acceptance. Research-owned acceptance mutation and downstream strategy gate remain separate work.
