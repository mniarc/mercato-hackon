# T83 - Configure an exact Discord destination without sending

State: implemented; 13 focused checks and app typecheck passed; connected demo proof pending
Sources: F34-2 AC1-2/4 (preparation only); F58-1 AC1; T66
Owns: new research/operations `lib/publicationDestination/**`; coordinated
research public service, operations DI and scoped staff configure API.

Reuse the registered native Discord channel, owner authorization and encrypted
credentials service. Explicitly select the case and native channel; for this
bounded demo, the requested external channel must match its configured default.
Persist only identifiers and integration references in the teammate publication
configuration. Preserve previous versions and exact-target consent semantics.

No token input, provider calls, new channel adapter or automatic target fallback.
Local configuration is not verified channel permission: readiness remains
`not_verified`, `canSend:false`. Missing configuration is explicit and preserves
the prior destination. This does not authorize a new purchased scope or consent.

Done when the staff API writes the real scoped configuration, the existing
review/consent reader exposes that exact target, and focused checks cover native
ownership, missing/mismatched configuration and immutable idempotent persistence.
Live provider verification and publication remain T31, not claimed by this task.

Preparation replay includes the actual configuration version and saved consent
state/record, not only post plus acceptance. Configuration of an already accepted
post refreshes its deterministic preparation from the existing receipt, preserving
prior instructions and decisions. An existing review
invitation is immutable: a newly configured target does not imply later consent or
silently reopen content approval. Coordinate any separate consent invitation seam.
