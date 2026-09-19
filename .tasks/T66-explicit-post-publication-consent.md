# T66 - Capture exact-version publication consent without publishing

State: implemented; focused checks verified; native configured-destination portal proof pending
Sources: F32-1 AC3-4; F32-3 AC1-4
Owns: research `lib/publicationConsent/**`, operations `lib/postReview/**`,
post-approval handoff and existing portal post-review component. Coordinate
shared research contracts/schema/DI and agency locale files with their owners.

Reuse native saved customer responses, G bindings and research document storage.
Expose a separate optional consent choice only for a real scoped publication
destination from configuration. Bind a distinct idempotent consent record to the
actual customer, source submission/task, exact post version/content hash and
destination, with decision time. Content approval never implies publication
consent; unknown destinations remain unavailable, not inferred from a URL.

Connect the existing publication-preparation consent reader to that record.
Changing post version or destination invalidates its applicability. Keep
`canSend: false`: no provider calls, real publication, paid calls, new target
registry or replacement approval framework. Preserve existing Polish copy.

Done when focused source/ownership/version/replay checks and the existing
post-review path prove separate explicit consent and exact-target reuse, while
missing consent or target stays explicit and publishing remains disabled.

Implemented in `d841a2dcb`. Six consent-related suites passed within the combined
40-check run; full app typecheck passed. Native portal proof with a genuinely
configured destination remains open; this is not full-story completion.
