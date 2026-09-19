# T84 — Request publication consent after content approval

State: active
Sources: F32-3 AC1–4, existing T66/T83.

Backend implemented; 20 focused checks and app typecheck passed. Native end-to-end
proof and teammate UI integration remain.

Deliver a staff-triggered native customer task for an already approved exact post
and currently configured destination. Keep the completed content review immutable;
do not repeat content approval or silently invite during destination configuration.

Reuse native workflow/task access and completion, typed consent records and
publication preparation. A deterministic explicit consent response has its own
native task/event provenance, not a fabricated agent run or submission. Verify
prior content approval independently. A changed post/target cannot accept the old
request. No provider call, UI change, automatic consent or sending (`canSend:false`).

Owned seam: operations `lib/publicationConsentRequest`, staff invitation API,
customer consent API, narrow research consent schema/record and DI registration.
Focused acceptance: scoped invitation; immutable original response; fresh consent
without content reapproval; current version/target guard; idempotent receipt;
existing bundled G consent remains compatible. Frontend caller remains teammate-owned.
