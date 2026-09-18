# T17 - Expose case-linked research document versions

State: active
Depends on: T12's implemented service/bridge, T14 (paid live proof is not a prerequisite)
Owns: `agency_operations/lib/clientArtifactService.ts`,
`lib/contracts/clientArtifact.ts`, focused tests and
`agency/api/portal/cases/[id]/artifacts/**`
Sources: F53-1, F55-1; teammate `agency_tov` versioned-document contract

Expose exact KLI-TOV versions linked by the customer's case workflow, using real
scoped reads and source-backed safe JSON. Exclude corpus, raw rendered documents,
internal evidence, provider traces and execution context. Copy no document entity.

Implementation, shared wiring and seven focused checks are complete. The real
headed journey verifies empty reads before production and 404 for unlinked versions.
Remaining: positive persisted ToV version read through the live API alongside
T12's artifact-producing proof; do not call the empty read full ToV acceptance.

This JSON is not HTML, an approval invitation or a claim about the current case
version. Teammate portal spec section 10 describes a separate review handoff;
[T22](T22-version-bound-client-review.md) owns its missing invitation/write boundary.
