# T16 - Resume a clarification from a scoped client reply

State: done (bounded clarification slice)
Depends on: T15
Owns: `agency_operations/lib/clientReplyService.ts`, `lib/contracts/clientReply.ts`,
`data/clientReply.ts`, focused tests, and
`agency/api/portal/cases/[id]/submissions/[submissionId]/replies/**`
Sources: F40-1, F41-1, F42-1, F45-1, F55-1

Persist the original reply, portal actor and retry-stable event ID. Resolve only
the customer's case/submission and exact native clarification wait server-side;
send the fixed native signal once. Never accept arbitrary workflow IDs/signals
or impersonate a staff user. Replay returns the saved reply even after resume.

Integrated on the persistent database. Ten focused checks cover access/replay;
the headed portal journey proves persisted reply, exact native continuation,
reload and harmless replay. Major boundaries live in
[ADR-001](../../.dev-docs/adr/001-agency-feature-boundaries.md).

This is clarification only: no artifact approval, fresh classification or full
agent continuation. Exact-version review is [T22](../T22-version-bound-client-review.md);
client interaction UI is [T20](T20-client-clarification-ui.md).
