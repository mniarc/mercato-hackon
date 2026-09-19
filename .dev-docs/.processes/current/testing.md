# Development and testing

Use the supported Open Mercato runtime and contracts. The daily environment is
one project-owned named database with durable storage and a separate development
app process with hot reload. App shutdown, code changes, branch merges, and test
failures must leave that database intact. Keep the browser open while working.

## Commands

Run from `App/ai-company/` in PowerShell:

After first pulling this launcher into an already installed checkout, run
`yarn workspace @open-mercato/cli build` once to expose its shared environment
helper. This is not part of subsequent app starts or test reruns.

```powershell
yarn dev:agency            # Leave running in its own terminal
yarn dev:agency:status     # Inspect from another terminal
yarn test:agency           # Run the one demo spec
yarn test:agency:headed    # Same scenario with a visible browser
yarn test:agency:demo      # Visible run plus checkpoint screenshots
node scripts/agency-dev.mjs cli <command> <arguments> # Native CLI, same owned DB/runtime
```

The app is at `http://localhost:5002`; local demo login is
`admin@acme.com` / `secret`. PostgreSQL uses `127.0.0.1:5544`, database `agency_dev`,
with a workspace-specific Compose project and named volume. Runtime state stays
under `ai-company/apps/mercato/.mercato/agency-dev/`; the launcher does not rewrite `.env`.
These are local demo credentials, not production credentials or live model keys.
Use `localhost` for the browser and runner: this dev-server configuration rejects
dynamic script requests from `127.0.0.1` with 403, leaving forms unhydrated.

First start initializes only an empty database, with platform defaults but without
optional example datasets. `Ctrl+C` stops the app while the database remains
available for the next start. `yarn dev:agency:setup` is explicit
initialization recovery; it does not reinstall. Apply pending schema changes with
`yarn dev:agency:migrate`. Shared platform-package edits can require a scoped
package build; ordinary app-module edits use the existing Open Mercato hot reload.
The launcher reuses Open Mercato's local integration environment: email/push
delivery is captured or fake, not sent to real recipients. This is not a
production configuration.

For explicitly enabled live agent runs, see [OpenRouter and native agent setup](agent-runs.md).

Legacy `test:agency:indev:start`, `:inspect`, and `:run` alias the persistent
commands. `test:agency:indev:recreate` remains an explicit ephemeral proof command;
do not use it to restart or maintain this daily environment.

## Daily loop

Tests support feature delivery, not a separate workstream to manufacture coverage.
Add a check only for a changed behavior or observed defect; do not expand harnesses,
repeat passing checks, or hold unrelated features behind an unrelated test failure.
State unproved runtime behavior plainly instead of presenting partial proof as a full pass.

1. Start or attach to the development app. Initialize the owned database once.
2. Edit code and use hot reload. Run generation only when discovered module files
   change; restart the app for configuration changes when needed.
3. Run focused unit/access tests and affected typecheck/lint. Then run the single
   demo spec when the changed runtime seam needs proof, headed when requested.
4. Fix the observed failure and rerun only the affected check. A failed assertion
   does not justify a rebuild, database recreation, or a full-suite run.

Keep module activation flags identical for generation, app and runner. If changing
native-fixture module discovery, use `node scripts/agency-dev.mjs cli generate`
with the same `AGENCY_TEST_NATIVE_TRIAGE`/`AGENCY_TEST_NATIVE_POST` flags as the
app. Bare `yarn generate` does not expand those launcher flags and can omit the
research/orchestrator modules, causing legitimate RBAC failures afterward.
If changing
the generated module set leaves Next reporting a missing server module factory,
restart the app with the matching flags; preserve the database. This is not a
reason to regenerate the database or weaken a portal assertion.

The separate demo runner must pass the complete matching app environment to
fixtures and workers: database, queue, auth/encryption configuration, and base
URL. Setting only `BASE_URL` can silently send fixtures to another database.
Use the maintained runner, exact-spec discovery, one worker, and zero retries.
Tests create and clean up only their own fixtures, leaving manual demo data alone.
Prefer one cross-surface journey; keep detailed access/data assertions in focused
tests. Report coarse progress steps, not polling noise.

`test:agency:demo` saves numbered screenshots at meaningful user-visible
checkpoints and attaches them to the Playwright HTML report. Report the run result,
checkpoint names, and artifact paths. Files live beneath
`ai-company/.ai/qa/test-results/artifacts/` and are linked from
`ai-company/.ai/qa/test-results/html/`; open that report with
`yarn test:integration:report`. Agents must not open, OCR, describe, or
otherwise visually inspect those images unless the user explicitly requests it;
use assertions, logs, and network/API evidence for routine diagnosis. This keeps
the screenshots available for human inspection without spending model tokens on
automatic image analysis.

Treat `test-results` as latest-run storage, not an archive. Playwright clears the
configured artifacts directory before each normal run and replaces the HTML
report when reporting finishes, so repeated demo runs do not accumulate images.
Do not add timestamped screenshot directories or automatic archives. A human who
needs lasting evidence must copy the selected files elsewhere before the next run.

## Database changes

- Confirm the project-owned database target before setup or migration. Never
  reset a teammate's, shared, or unrelated workspace database.
- Generate/review migration artifacts when entities change; generation does not
  apply them. Apply needed migrations to the named development database without
  rebuilding it. Existing authorization for this environment covers its normal
  setup and migrations; unrelated databases need their owner's authorization.
- Recreate only for an intentional reset or confirmed unrecoverable state.
  Schema changes and ordinary seed additions do not automatically require it.

## Production proof and teardown gotchas

A clean production build and isolated database are an explicit release/CI or
clean-install proof, or a diagnostic for a demonstrated build/setup/isolation
problem. They are not mandatory after every merge, milestone, or assertion fix.

If using the Open Mercato ephemeral runner, keep its app owner in a separate
terminal while running tests. `--keep` reaches its wait only after a passing
suite: on failure the owner can exit and Testcontainers can delete the database.
Even a retained ephemeral database can disappear when its owner stops; it is not
the persistent development environment.

Stop an ephemeral owner normally and let it release its app/descriptor/containers.
Do not force-kill its tree or delete its descriptor while it is alive. Reuse of
a built app depends on source freshness and TTL; never accept stale-code proof.
Do not use `--no-reuse-env` for routine failure iteration.
