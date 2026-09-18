---
name: om-prepare-test-env
description: Prepare or inspect this team's Open Mercato development/test environment. Reuse the persistent agency database and development app; use the existing ephemeral runner only for explicit isolated production or CI proof.
---

# Prepare the team test environment

Follow the canonical [development/testing process](../../../../.dev-docs/.processes/current/testing.md).
It defines the team's chosen default; do not ask again whether to use ephemeral
mode. Preserve Open Mercato's runtime contracts and use the maintained commands
instead of inventing another launcher, descriptor, or generated shell script.

## Daily development

Run from `ai-company/`:

- `yarn dev:agency`: foreground development app with hot reload and a durable
  project-owned PostgreSQL database. Leave it in its own terminal.
- `yarn dev:agency:status`: inspect the environment.
- `yarn test:agency` or `yarn test:agency:headed`: one demo spec, no retries,
  using the same complete fixture/worker/app environment.
- `yarn dev:agency:migrate`: apply pending migrations when schema changes.
- `yarn dev:agency:setup`: explicit initialization recovery, not reinstall/reset.

`Ctrl+C` stops the app and leaves the database/volume intact. First startup
initializes only an empty database. Ordinary edits use hot reload; shared platform
package changes may need a scoped package build. Product edits never justify a
database reset by themselves.

The maintained runner supplies database, queue, JWT/encryption, integration flags,
and base URL together. A plain Playwright call with only `BASE_URL` can send
fixtures to another database; use the team test command. Do not log secrets or
write the local runtime state into Git.

## Explicit isolated proof

Use the existing Open Mercato ephemeral CLI only for requested production/CI
proof, clean-install behavior, or a demonstrated isolation/setup issue. Start
app-only with `yarn test:integration:ephemeral:start` in an owner terminal; run
filtered tests through `yarn mercato test:integration <filter> --retries=0`
with matching full environment. The CLI owns `.ai/qa/ephemeral-env.json`, port
selection, provisioning, build freshness, and teardown. Never write it by hand.

- `--keep` waits only after success. A failed suite can exit its owner and
  Testcontainers can delete the database. Keep the owner separate from tests.
- Stopping even a retained ephemeral owner can destroy its database. It is not
  the persistent development database.
- Reuse is gated by source freshness and TTL. A stale production build needs
  rebuilding, not a blind rerun against the old source.
- Stop the owner normally before replacing its environment. Do not delete the
  descriptor or force-kill its process tree while it is alive.
- `test:agency:indev:recreate` is a legacy ephemeral proof command, not a daily
  database maintenance command.

For actual remote CI parity, inspect the checked-in CI job and its required env
block. Do not copy enterprise flags or live service secrets into the daily demo.

## Useful failure checks

Check the runtime's actual URL and database target before diagnosing app data.
An HTTP login probe uses form-encoded credentials; a JSON body can produce a
400 without indicating broken authentication. Resolve encrypted identities
through authentication/shared helpers rather than SQL against plaintext email.
Use the shared browser login helper and readiness signals rather than arbitrary
sleep or `networkidle` on pages with ongoing event streams.

A new standalone checkout needs its supported install/generation chain; missing
CLI/generated artifacts are setup failures, not reasons to repeatedly recreate
PostgreSQL. Stop at the failing layer and fix that layer.
