# T93 — Persistent manual fixture and live walkthrough modes

State: source implemented; persistent native/manual proof pending
Source: requested manual customer → agency → employee walkthrough; F01–F33 implemented paths.

Extend the existing agency launcher with isolated, persistent manual fixture and
live profiles. Reuse native queue workers, the existing unpaid intelligence
fixtures, and private central OpenRouter configuration. Human portal decisions
must remain genuine; never seed approvals or completed producer results.

Own launcher/wrappers/manual-qa guidance; the companion owner owns
`scripts/agency-manual-fixture.ts` and `scripts/support/manualFixture/`.
Keep development on port 5002 untouched. Separate ports, Compose volumes,
database names, queues, attachments, cache and Next output. No database resets.
Live execution requires explicit human opt-in; implementation/testing makes no
paid calls. Native workflow policies remain explicit staff configuration.

Done: source checks pass, unpaid persistent manual flow is proved without the
automated runner, and live configuration is prepared but never claimed live-proved.

Launcher syntax and focused profile/default/mode tests pass (13/13). No manual profile
has been started or paid call made. CLI/profile contract is in existing manual-qa.md;
automated same-journey fixture/live source is integrated under T95; joined proof remains.
