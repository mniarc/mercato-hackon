# T64 - Navigate exact research dependencies and version history

State: implemented; nine focused UI checks and app typecheck passed; native browser navigation proof pending
Sources: F53-1 AC2–4
Owns: employee case `researchLineage/**`, its research-ledger mount and additive locale keys

Expose clickable persisted input-version references and document history beside the
employee's selected research output. Reuse the existing scoped document-version
list/read APIs; resolve the exact referenced version, never the newest fallback.
Show recorded statuses and decision person/time/version without inferring approval.

Done when a post can be traced to its historical inputs and decisions, with missing,
foreign or forbidden references left explicit. One focused UI check group; no new
API, entity, producer, automatic full-tree fetch or publication permission.
