# Linux Docker deployment

Use `ai-company/docker/agency/compose.yml` and the existing root Dockerfile.
The native build runs packages → generation → packages → Next production build.
Agency module flags match at build/runtime; local runtime state and secrets are excluded.
Test fixture execution is disabled; production agent execution needs explicit configuration.
Build proof is still pending; packaging alone does not prove a deployed customer journey.

## Package

`App/bin/agency.ps1` (Windows PowerShell 5.1+) and `App/bin/agency.sh` (Bash/sh)
share one Node 24 command runner. Paths to native assets resolve from the scripts,
not the current directory. Supply absolute paths for `--env-file` and `--file`.
From the team `App/` root in an isolated checkout (not the running demo checkout):

```sh
sh bin/agency.sh build --image agency-app:<commit>
sh bin/agency.sh verify-image --image agency-app:<commit>
sh bin/agency.sh export --image agency-app:<commit> --file /tmp/agency-app.tar
```

On Windows use `& .\bin\agency.ps1 build --image agency-app:<commit>` (same arguments
for other commands; Git Bash is also supported). Build does not read runtime secrets.
`verify-image` separately checks registrations, worker artifacts and non-root writable
directories with networking disabled; it never starts the app or contacts a database/provider.
Transfer/load that image on the server, or use your chosen private registry; no registry
or CI credentials are part of this repository.

For a handoff that does not include a development checkout, package the already-exported
image and the small deployment surface into one uncompressed tar. The output target must
not exist; packaging streams the image and never builds, loads, starts, or deletes it.

```sh
node bin/package-release.mjs \
  --image agency-app:<commit> \
  --image-file /absolute/path/agency-app-<commit>.tar \
  --output /absolute/path/agency-release-<commit>.tar
```

The outer tar contains one `agency-release-*` directory with the image archive,
`bin/agency.{mjs,ps1,sh}`, Compose/runtime templates, and `QUICKSTART.txt`. It contains
no application source, dependencies, private environment file, or secrets. After
extraction, run commands from that directory so the unchanged runner can resolve
`ai-company/docker/agency/compose.yml`. Docker Engine, Compose v2 and Node.js 24 are
required; the bundle imports its prebuilt image and is not a server-side build kit.

## Configure and start

Create `/etc/agency/runtime.env` from `ai-company/docker/agency/runtime.env.example`, outside the
checkout; restrict it to the deployment operator. Set an immutable image tag, HTTPS
origin and independent random secrets. Retain the encryption key with database backups.
Native account verification also needs the real system email provider configured through
Open Mercato before opening self-service registration; this package does not invent mail credentials.

Run from `App/` on the server:

```sh
sh bin/agency.sh import --file /tmp/agency-app.tar
sh bin/agency.sh preflight --env-file /etc/agency/runtime.env --for init
sh bin/agency.sh up --env-file /etc/agency/runtime.env --service postgres
# First empty database only; never passes --reinstall.
sh bin/agency.sh init --env-file /etc/agency/runtime.env --organization "Our Agency"
sh bin/agency.sh up --env-file /etc/agency/runtime.env
```

Preflight checks Docker/Compose, quiet Compose configuration, required runtime settings
and the selected local image; no build, DB mutation, provider validation or send. When
agents are disabled it requires no model key. Native init refuses an existing users DB;
it creates a superadmin plus derived admin/employee accounts. Configure all three private
passwords explicitly, with native password policy enabled; the runner redacts secret output.
Remove the `OM_INIT_*` values from the private env file after successful initialization.

Put the loopback HTTP port behind the server's HTTPS reverse proxy. This is one app
replica: native `server start` owns `queue worker --all` and the scheduler; the named
storage volume retains attachments, local jobs and SQLite cache, and the database has
its own named volume. Do not scale this local-queue topology to multiple app replicas.

## Update

Back up database/storage, load the new image, update `AGENCY_IMAGE`, then use an agreed
maintenance window to stop the old app and run native migrations separately:

```sh
sh bin/agency.sh preflight --env-file /etc/agency/runtime.env --for migrate
sh bin/agency.sh stop --env-file /etc/agency/runtime.env --service app
sh bin/agency.sh migrate --env-file /etc/agency/runtime.env
sh bin/agency.sh deploy --env-file /etc/agency/runtime.env
sh bin/agency.sh status --env-file /etc/agency/runtime.env
sh bin/agency.sh logs --env-file /etc/agency/runtime.env --service app
```

`up`/`deploy` wait for selected services' native healthchecks. `deploy` is only an alias
for `up`, never SSH, push, build, init or migration. `migrate`
runs the native migration command then native role-ACL sync. `config-check` validates
Compose with `--quiet` (no rendered secrets). `stop` retains all volumes; there is no
reset command. Never use `down -v` for an update. Image rollback does not reverse migrations.
The central [agent configuration](agent-runs.md) applies to injected runtime variables:
triage/analysis stay disabled until scoped workflows, budgets and spend are approved.
Packaging enables neither demo payments nor publication; Discord remains preparation-only.
