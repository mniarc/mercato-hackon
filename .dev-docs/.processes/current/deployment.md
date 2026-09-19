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
`bin/agency.{mjs,ps1,sh}` and its logging helper, Compose/runtime templates, and `QUICKSTART.txt`. It contains
no application source, dependencies, private environment file, or secrets. After
extraction, run commands from that directory so the unchanged runner can resolve
`ai-company/docker/agency/compose.yml`. Docker Engine, Compose v2 and Node.js 24 are
required; the bundle imports its prebuilt image and is not a server-side build kit.

## Build and package logs

`build`, `verify-image`, `export`, `import` and `package-release.mjs` automatically
retain a timestamped invocation log at `App/.build-artifacts/.cache-logs/*.log`
(or the extracted bundle's same relative directory). The command prints its log
path immediately and again on failure. Console output remains live; stdout and
stderr are streamed with stage/start/end/exit-code/signal metadata. Docker build
uses plain progress. No log rotation deletes previous failures automatically.

Runtime/config/init commands are not automatically logged. Logs never dump the
environment; obvious secret arguments and known secret output are redacted.
Build scripts themselves should never print credentials. The directory is
gitignored; review logs before sharing them. A missing end record means the
wrapper was interrupted/killed before finalization, not a successful build.

This captures **new invocations only**. For an already-running BuildKit build,
recover native history separately without restarting it:

```powershell
docker buildx history ls
docker buildx --builder desktop-linux history logs --progress plain <short-build-ref>
```

Use the builder and short reference reported by Docker; native history may not
include wrapper setup or commands run outside that build. Do not infer completion
from a quiet log, or restart a build merely to add logging.

## Configure and start

Create `/etc/agency/runtime.env` from `ai-company/docker/agency/runtime.env.example`, outside the
checkout; restrict it to the deployment operator. Set an immutable image tag, HTTPS
origin and independent random secrets. Retain the encryption key with database backups.
Native account verification also needs the real system email provider configured through
Open Mercato before opening self-service registration; this package does not invent mail credentials.

Compose's `--env-file` supplies substitutions, not unrestricted container variables.
The template explicitly forwards the supported central agent and mail settings.
For native Resend email set `SYSTEM_EMAIL_PROVIDER=resend`, private `RESEND_API_KEY`
and a verified `NOTIFICATIONS_EMAIL_FROM`, then `OM_DISABLE_EMAIL_DELIVERY=false`.
Set these before first `init` so native setup seeds the scoped system-email channel.
For an existing scope configure the Resend integration/system-email channel through
the staff UI; changed environment does not replace saved channel credentials.
Mail defaults off. Preflight checks configuration only; it sends no verification email.

For separately approved paid execution, use `OM_AI_PROVIDER=openrouter`,
`OM_AI_MODEL=openrouter/<exact-model-id>` and the private `OPENROUTER_API_KEY`.
Set `OM_AGENCY_TRIAGE_MODE=live` for client interpretation, and enable
`AGENCY_ANALYSIS_EXECUTION_ENABLED` / `AGENCY_TOV_EXECUTION_ENABLED` only for the
required lanes. MODE overrides the legacy `OM_AGENCY_TRIAGE_ENABLED` flag; the
legacy flag never selects live execution. Live triage requires explicit positive
`OM_AGENT_RUN_TIMEOUT_MS`, `OM_AGENT_PROVIDER_RETRY_MAX` and
`OM_AGENT_PROVIDER_RETRY_BASE_MS` (template: 60000 / 1 / 1000).
Those bounds do not enforce a monetary ceiling or cancel in-flight provider work.
Native scoped workflow grants, published definitions and per-phase approved policy
budgets remain required: see [agent configuration](agent-runs.md). Redeploy the app
after env changes so its workers receive the same settings. All lanes default off;
demo purchases, test fixtures and publication remain disabled by this profile.

Select an image containing the integration you intend to run. Configuration can
enable existing code, not add newer source changes to a frozen image. In particular,
packaging updated Compose/templates alongside an older image is not proof that the
latest specialist intake/strategy bridge is present or that live execution passed.

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
