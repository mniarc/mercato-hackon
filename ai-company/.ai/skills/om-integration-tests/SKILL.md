---
name: om-integration-tests
description: Run or author focused Open Mercato Playwright integration tests using the team's persistent development environment. Use for feature/demo verification or integration test changes; keep environment lifecycle separate from test execution.
---

# Integration tests

Read [the team's testing process](../../../../.dev-docs/.processes/current/testing.md)
for commands and lifecycle. Use the existing persistent development app and named
database by default. Environment setup belongs to the maintained runner described
in [om-prepare-test-env](../om-prepare-test-env/SKILL.md); do not invent a second
environment or require a fresh production build for each integration.

## Run existing tests

From `ai-company/`, start `yarn dev:agency` in its own terminal when needed.
Run `yarn test:agency` or `yarn test:agency:headed` separately. The runner picks
the exact demo spec, one worker, zero retries, and matching database/queue/auth
environment. Failed assertions leave the app and persistent database available.
Use `yarn dev:agency:status` for its actual state.

Do not run plain Playwright with only `BASE_URL`; fixture helpers may otherwise
use a different database. For requested isolated production/CI proof, use the
Open Mercato CLI with its complete environment, as the preparation guide describes.
Running existing tests does not require new scenarios, specs, or review files.

## Author the smallest useful proof

1. Read the requested behavior and existing tests. Keep one cross-surface demo
   journey; put detailed access/data edge cases in focused tests where possible.
2. Inspect the actual UI for changed selectors and use roles/labels. Reuse
   observed selectors for unchanged paths.
3. Place executable specs under the module's `__integration__/`, with local
   helpers beside them. `.ai/qa/tests/` holds shared configuration only.
4. Create test-owned fixtures and clean up only those records in `finally` or
   teardown. Never depend on unrelated seeded/demo records or erase manual data.
5. Run the affected spec with the matching environment and no retries. After a
   failure, inspect its output/artifact, fix the observed cause, and rerun that
   path. Expand checks only for a new demonstrated risk.

Use Open Mercato published helpers from
`@open-mercato/core/helpers/integration/*` for login, API fixtures, and queue
draining. Queue drains must run in the target app context with the same queue
directory and configuration. Keep metadata gates for genuinely optional modules
or external services; do not make deterministic demo tests require live LLM keys.

Use the existing shared Playwright configuration; avoid ad hoc per-test timeout
or retry changes. When local development compilation needs extra readiness time,
configure that explicitly in the maintained development harness. Use coarse
steps (setup, intake, workflow, employee UI, download, cleanup) without per-poll
logging or duplicate assertions.

Report pass/fail and any unverified behavior accurately. On failure, give the
specific failing step, evidence, likely cause, and next fix. Do not create an
additional report/table file or mark a broken path passed. Scenario Markdown is
optional and should be written only when requested or durably useful.

For Open Mercato helper details and optional metadata see
[QA instructions](../../qa/AGENTS.md). Platform-wide suite/parity commands apply
when that platform surface actually changes, not as default local demo gates.
