# T50 - Let the client review and accept the exact QA-ready post

State: done
Depends on: T49 saved QA-ready post; T29 exact post-review projection
Delivered: `fb1a9e6cd`; focused checks and app typecheck passed. The persistent headed canonical journey passed on 2026-09-19: real selected-instruction author/editor repair, native post review, original response through G, exact content-only receipt and portal reread. Publication stayed blocked. This proves fixture intelligence integration, not paid model quality or the native T49 execution activity.
Sources: F32-1 (content review and G intake only), F32-2, F33-1 (acceptance branch only)
Owns: producer `agency_research/lib/postAcceptance/**`; native caller `agency_operations/lib/postReview/**` and `postApproval/**`; portal `agency/api/post-reviews/**` and `agency/components/post-review/**`. Coordinator owns public contracts/service, G schema and authorized effects, DI, workflow/configuration, portal mounting and employee projection.
Context: T49 stops at editorial readiness. `agencyResearchService.getPostReview` already provides the exact WZR-POST client view, currentness, simulation flag and bound 7.3 QA; no public post acceptance mutation or native post invitation exists.

## Deliver

- Continue a saved T49 ready result into one replay-safe native customer UserTask
  for that exact post version; retain a real waiting-for-decision state. Reuse
  `planReview`/`briefStrategyProcess` task access, assignment and response patterns,
  plus the teammate `DocumentReview` renderer in content mode, not a new inbox.
- Show the full persisted client-safe text only after positive exact-version
  editorial QA. Original questions, corrections and holds enter G; an explicit
  content approval is distinct from a free-text message or conditional approval.
- Apply the saved G acceptance branch once through a public research-service
  mutation. Bind the current post, positive QA, authorized customer, timestamp and
  originating submission/native invitation to the existing version approval records.
  Reuse `planAcceptance`/`briefAcceptance` persistence and replay conventions.
- Keep customer response receipt separate from applied acceptance. Show only the
  persisted content-acceptance result; no publication consent, target, send or
  downstream publication instruction is inferred from it.

## Done when

- A real native customer task presents T49's exact QA-ready version; its explicit
  approval travels through G and produces one content-only receipt visible on reread.
- Focused boundary checks cover foreign/stale versions, failed or newer incomplete
  QA, simulated outputs, conditional/change messages and duplicate submission.
  None can approve another version or grant publication permission.
- Coordinator extends the existing persistent native fixture at this new seam;
  reuse established task/portal checks rather than rerunning unrelated production.

## Constraints

- Do not edit teammate author/editor workers or rerun production for review.
  Paid calls are unnecessary for this handoff and remain off.
- F32-1's optional exact-target publication instruction, F32-3 consent records,
  F33-1 correction/hold execution and F33-2 publication preparation remain outside
  this bounded slice. Preserve their original requests through G without claiming
  an unsupported effect ran. No invented publication target or round limit.
- T28's bounded plan/instruction proof is complete; T49 native post execution
  remains unproved. This task records no completed-story claim and does not
  require a new business decision to begin.
