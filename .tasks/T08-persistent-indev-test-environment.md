# T08 — Persistent owned INDEV test environment

State: active
Owns: local test-environment configuration and developer commands, not product
runtime code.

## Outcome

Keep one project-owned Open Mercato app and database environment available for
fast filtered Playwright/demo iterations instead of cold-booting and reseeding a
new database for every run.

## Deliver

- Use the supported Open Mercato HMR app with one project-owned named PostgreSQL
  volume and a separate exact-spec Playwright runner sharing its full environment.
  This supersedes retained ephemeral/INDEV ownership: its database could disappear
  when the owner process exited.
- Provide start, inspect, filtered-run, and migration commands for PowerShell;
  stopping the app must leave the database intact. Keep commands in the
  [testing process](../.dev-docs/.processes/current/testing.md), not another guide.
- Make an explicitly filtered spec start without paying full-suite discovery or
  unrelated global bootstrap cost; extend the supported runner instead of
  creating a parallel test framework.
- Make environment ownership and database identity explicit before migrations,
  resets, cleanup, or fixture writes.

## Safety

- Never point destructive setup at a developer, shared, team, or demo database.
- Apply migrations and test cleanup only to the explicitly owned INDEV database.
- Migrate schema changes without rebuilding the database. Reset only on an
  intentional request or confirmed unrecoverable state, never merely because
  code changed or a test failed.
- Disposable production proof is exceptional, not mandatory after each milestone.

## Done when

- A filtered demo spec can be rerun without rebuilding or reseeding the stack.
- The selected Playwright worker starts directly rather than scanning or
  preparing unrelated integration suites.
- A new session can discover and safely reuse or deliberately replace the owned
  environment without guessing which database it targets.
- Stopping/restarting the app preserves the same database and seeded state.

## Evidence and remaining work

The persistent launcher is implemented. Two launcher unit tests, CLI build, and
single-test discovery passed; the owned database initialized and HMR app started.
The headed scenario reached real intake/workflow execution but failed at employee
login readiness. Still confirm the successful T04 rerun and stop/restart
persistence; do not replace this with another disposable-stack proof. Decision:
[ADR-002](../.dev-docs/adr/002-persistent-development-runtime.md).
