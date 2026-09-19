# T81 - Reduce agency demo runner configuration friction

State: done
Source: user request to trim self-inflicted testing overhead without reducing coverage
Owns: `ai-company/scripts/agency-dev.mjs`, its isolated Node tests, and narrow command guidance in `testing.md`.

## Deliver

- Add an explicit journey selector for the existing persistent app and demo runner while keeping the canonical journey as the default.
- Make the production selector apply the existing loopback intelligence, source fixture, native post, and zero-charge purchase settings consistently to app and runner.
- Reject conflicting non-secret journey settings early and keep exact-spec discovery, one worker, zero retries, screenshots, cleanup, assertions, and persistent database behavior unchanged.

## Verify

- Run only the isolated agency launcher Node tests and syntax/diff checks; do not touch the shared runtime.

Verified: 10 isolated Node checks passed; syntax and diff checks passed. No shared
runtime or database operations were needed. Existing scenarios and assertions
remain unchanged; this closes runner configuration friction, not full-demo proof.
