# T78 - Apply late material to the current unapproved brief

State: active
Implementation: producer, native G handoff and review continuation are connected;
13 focused suites (120 checks) passed. Remaining: connected native fixture proof
of late material updating the unapproved brief and returning a fresh invitation.
Initial-upload proof in T76 does not prove this later revision path. No live proof.
Sources: F11-1, F11-2; F06-3; F40-1, F41-1; F44 remains a separate impact path
Depends on: T74 saved supplements; T76 native private-text extraction
Owns: agency_research/lib/materialRevision; agency_operations/lib/materialRevision and the native G material handoff

## Deliver

- Bind one saved submission, extracted attachment and G-identified question/brief
  field to the current unapproved brief, under explicit native execution budget.
- Reuse teammate extraction/grounding to append evidence without resetting prior
  IDs. Update only the identified findings field; files are not client decisions.
- Reuse analysis QA, version-set freeze and the existing brief/QA producer to
  return a new version of the same brief and its native review invitation.
- Preserve private evidence, prior versions and decisions. Deduplicate by saved
  submission. Missing extraction/evidence or failed QA stays explicit.
- No full order replay, unrelated audit/competitor refresh or approved/downstream
  invalidation. Those require the distinct F44 impact path.

## Done when

Focused checks cover grounded append/retained IDs, bounded field update, duplicate
submission and approved/current-version boundaries; the coordinator records a
connected native fixture proof separately from live-model execution.
