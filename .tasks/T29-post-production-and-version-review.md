# T29 - Produce and review one exact text-post version

State: active
Depends on: T28, T22; T26 for supplementary research
Owns: active projection slice `agency_research/lib/postReview/**`; coordinator owns public research service/contracts. Later: `agency_operations/lib/postProcess/**` version-bound client review and producer handoff.
Sources: F30-1, F30-2, F31-1, F31-2, F32-1, F32-2, F32-3, F33-1, F33-2

## Active bounded slice

- T49 owns the phase-only native producer; [T50](tasks-done/T50-review-and-accept-exact-post-content.md)
  delivered the connected customer review and content-only acceptance handoff.
  [T51](tasks-done/T51-prepare-publication-from-accepted-post.md) delivers publication preparation only.
  The projection below is reused by that handoff, not rebuilt.
- Expose an exact persisted WZR-POST version, its stored client view, currentness,
  simulation flag and exact step 7.3 editorial QA (F32-1, F33-2).
- A newer failed or incomplete QA attempt for that version suppresses an older
  pass. QA for another output never qualifies; client content is not regenerated
  from internal evidence.
- Export `readPostReview` and types for the coordinator's existing research service
  wiring. No new renderer, generation agent, acceptance or publication permission.
- Focused checks cover scoped exact reads, version/QA binding, stale results and
  simulation honesty. This projection alone does not complete the full task below.

## Deliver

- Generate one versioned text draft from its exact post instruction; editorial QA
  can request correction, targeted evidence, a client question or an owned exception.
- A research return resumes the same bound QA task/version. Reuse native workflow
  waits and customer receipts for text acceptance and separate version+target consent.
- Assemble publication instructions deterministically; missing target/consent may
  leave preparation pending but must never authorize sending.

## Done when

- One draft travels through QA and exact-version review; focused checks prove the
  research return and separation of text approval from publish authorization.

## Constraints

- Reuse merged RES-03 `agency_research` post author/editor and publication-document
  producers. Own the missing real review/consent integration, not replacement agents.
  Simulated upstream approvals and `not_executed` publication records remain explicit;
  neither authoring nor preflight is evidence of customer acceptance or a real send.
- Saved G changes block outdated publication. Do not implement a second approval
  engine or broaden one-post scope.
- Exact-target consent (F32-3) needs a trusted staff/integration entry point for
  real account/channel IDs. The current publication builder leaves those IDs null
  and document APIs are read-only. Do not substitute a profile URL or expose a
  positive consent form until that target-provisioning owner/source is settled.
