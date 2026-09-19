# T17 - Expose case-linked research document versions

State: legacy ToV read boundary implemented; not the current portal review path
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
Legacy-only remaining proof: positive persisted ToV version read through this API
alongside T12's artifact-producing proof; empty reads are not ToV acceptance.

This JSON is not HTML, an approval invitation or a claim about the current case
version. It reads genuine `agency_tov` outputs for that workflow, not an overlapping
production scaffold. Current teammate portal reviews instead use
`StrategyPairReview` -> `/api/agency/strategy-reviews/{taskId}` ->
`strategyPairReview/service.ts` -> research `getStrategyReview` and exact pair
acceptance. No production UI calls this artifact endpoint. Preserve compatibility;
do not route research Markdown through the legacy ToV JSON contract.
