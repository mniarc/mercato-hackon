# ADR-002 - Persistent development runtime, separate demo runner

Status: accepted

## Decision

Keep one project-owned PostgreSQL named volume and run Open Mercato's development
app independently with hot reload. Run the single Playwright demo against that
app with the complete matching environment. Headed/headless are modes of the
same scenario, not separate testing paths.

This replaces retained ephemeral infrastructure as the daily environment: its
owner lifecycle could remove the database, and production freshness checks could
turn a small test rerun into another cold build. App shutdown and test failure
must not reset development data. Apply migrations explicitly when needed.

## Consequence

Use focused tests for detailed behavior and one browser journey for the real
cross-surface seam. An isolated production/clean-install proof remains available
for a release or demonstrated setup problem, not as an automatic merge gate.
Fixture cleanup owns only its own rows/files, leaving manual demo data intact.

Commands, target identity, and teardown rules belong in the
[testing process](../.processes/current/testing.md). Implementation and remaining
restart/reuse acceptance stay in the task backlog, not in a growing ADR progress log.
