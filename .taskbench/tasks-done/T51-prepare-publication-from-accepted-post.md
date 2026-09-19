# T51 - Prepare publication from the exact accepted post, without sending

State: done
Delivered: `a56bdb5f7`, pushed with `b7e92c339`; full headed journey subsequently passed with `23bc9e681`, including accepted-post → saved preparation → employee API/UI visibility. No publication consent or sending is claimed.
Depends on: T50 content-only acceptance
Sources: F33-2; F32-3 separation only, not publication-consent collection
Owns: `agency_research/lib/publicationPreparation/**` producer and `agency_operations/lib/publicationPreparation/**` native handoff. Coordinator owns public service, workflow/DI and existing employee projection.

## Deliver

- Continue the saved exact post acceptance into deterministic publication preparation.
  Reuse teammate `research/publication.ts` builders, publication renderers and version
  storage; do not run the complete research pipeline or replace their workers.
- Pin the accepted post, receipt and payload. Replaying the same acceptance returns
  the same prepared references, never another send or model call.
- Persist the internal instruction with the known channel/destination and explicit
  missing target/consent/access gates. Preparation may proceed despite those gaps;
  it never authorizes publication. Show its references and blockers to employees.
- Map the validated post acceptance into the builder's existing content-approval
  facts. Its legacy envelope schema currently accepts only brief-source records;
  do not silently discard a genuine post receipt or infer publication consent.

## Done when

The existing accepted-post journey yields a persisted instruction for that exact
text with content approval valid and publication consent still missing. Verify the
changed seam and replay once; no separate test matrix or unrelated reruns.

## Boundaries

No publication adapter call, execution reservation, fabricated 8.7 attempt record,
client consent collection or new business policy. T31 and proposed F34–F37 remain
separate. Do not edit runtime-affecting code during the current T50 demo.
