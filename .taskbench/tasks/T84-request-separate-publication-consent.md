# T84 — Request publication consent after content approval

State: active
Sources: F32-3 AC1–4, existing T66/T83.

Backend and teammate portal caller/dispatch implemented. The backend has 20 focused
checks plus app typecheck; the portal caller has 2 focused suites / 10 passing tests.
Native joined proof remains. The staff invitation API is the current trigger; a
staff UI remains optional and is not implemented.

Deliver a staff-triggered native customer task for an already approved exact post
and currently configured destination. Keep the completed content review immutable;
do not repeat content approval or silently invite during destination configuration.

Reuse native workflow/task access and completion, typed consent records and
publication preparation. A deterministic explicit consent response has its own
native task/event provenance, not a fabricated agent run or submission. Verify
prior content approval independently. A changed post/target cannot accept the old
request. No provider call, automatic consent or sending (`canSend:false`).

Owned seam: operations `lib/publicationConsentRequest`, staff invitation API,
customer consent API, narrow research consent schema/record and DI registration.
Focused acceptance: scoped invitation; immutable original response; fresh consent
without content reapproval; current version/target guard; idempotent receipt;
existing bundled G consent remains compatible. The customer task dispatcher now
routes `agency.publication-consent` to the portal caller, which displays the exact
approved post and configured destination and records consent without publishing.
