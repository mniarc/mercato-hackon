# Run the packaged app on a server

Use Linux Docker Engine + Compose v2 and Node.js 24. Windows operators can use
PowerShell 5.1 with Docker Desktop **Linux containers**. No checkout, Yarn install,
application build or model key is needed to run the imported image.

**One installation per Docker daemon.** The launcher fixes the Compose project
to `agency-server`: different folders or HTTP ports do not isolate the database
or storage. Use a separate Docker daemon for another installation. Run one app
replica; native workers/scheduler run with it.

## Prepare and start

Extract the outer `agency-release-<revision>.tar`, retaining its directory layout.
Use a trusted artifact/checksum. For the existing `1209dbd26` release, the bundle
SHA256 is `2E32E592F1F5A1598D5A6BA10CEC16440494374BB4B0D2A5A7ADD7F27AE8F608`.
Its image is `agency-app:1209dbd26`; later packages need their own tag/checksum.

The helpers delegate to **the selected release's** `bin/agency.mjs`. Future bundles
include this `server-setup` directory. For the older bundle, copy these three
`setup.*` files together anywhere, then pass its extracted directory explicitly.

Linux (replace paths, image tag and organization):

```sh
release=/srv/agency-release-1209dbd26
setup=/path/to/server-setup/setup.sh
runtime=/etc/agency/runtime.env
# Create this directory as the operator, or ask your administrator to provision it.
install -d -m 0700 /etc/agency
sh "$setup" prepare --release-dir "$release" --env-file "$runtime" --image agency-app:1209dbd26
sh "$setup" import --release-dir "$release" --image-file "$release/image/agency-app-1209dbd26.tar"
```

Windows PowerShell (use a private directory accessible only to the operator):

```powershell
$release = 'D:\agency-release-1209dbd26'
$setup = 'D:\tools\server-setup\setup.ps1'
$runtime = 'D:\private-agency\runtime.env'
New-Item -ItemType Directory -Path 'D:\private-agency' -Force | Out-Null
& $setup prepare --release-dir $release --env-file $runtime --image agency-app:1209dbd26
& $setup import --release-dir $release --image-file "$release\image\agency-app-1209dbd26.tar"
```

`prepare` creates the file exclusively: it never overwrites a previous config.
Restrict the Windows directory ACL yourself; POSIX files are created mode `0600`.
Edit the file privately before proceeding. Set the correct `AGENCY_IMAGE`, public
HTTPS `APP_URL`, bootstrap email, **three independent account passwords**
(superadmin/admin/employee), and a separate PostgreSQL password. Generate separate
random JWT/auth/encryption secrets; retain the encryption key with your backups.
Do not paste secrets into commands or chat. Keep agent execution and mail disabled
for this initial smoke test. Registration cannot complete while mail is disabled.

First-time initialization only, after confirming this daemon's agency database is empty:

```sh
sh "$setup" check --release-dir "$release" --env-file "$runtime" --for init
sh "$setup" init --release-dir "$release" --env-file "$runtime" --organization "Our Agency" --confirm-empty-db
sh "$setup" start --release-dir "$release" --env-file "$runtime"
sh "$setup" status --release-dir "$release" --env-file "$runtime"
```

```powershell
& $setup check --release-dir $release --env-file $runtime --for init
& $setup init --release-dir $release --env-file $runtime --organization 'Our Agency' --confirm-empty-db
& $setup start --release-dir $release --env-file $runtime
& $setup status --release-dir $release --env-file $runtime
```

`init` checks configuration/image, starts PostgreSQL, then calls native first-time
initialization. The acknowledgement is not an emptiness probe: native init refuses
existing users. Never use init to repair, reset or upgrade an existing installation.
Stop after any failed command; fix the reported cause before proceeding.
No action automatically migrates or initializes when starting. Remove `OM_INIT_*`
values after successful initialization. Existing-server upgrades require a backup,
maintenance window and the explicit native `bin/agency.* migrate` command.

## Open, smoke-test and retain data

Configure an HTTPS reverse proxy to the host's `127.0.0.1:3000` (or your configured
`AGENCY_HTTP_PORT`); that port is intentionally not public. Open your `APP_URL` +
`/login`, sign in with the configured superadmin email/password, then open
`/backend` and `/backend/agency-operations/cases`. There is no production `secret`
password or fixed `acme-corp` organization. Customer URLs use the actual configured
organization slug: `/<slug>/portal/login` and `/<slug>/portal/signup`.

For a no-model smoke test: confirm service health, sign in, save a harmless staff
profile change, sign out/in, then `stop` and `start` and confirm it remains.
Inspect `logs` if startup fails. The same helpers accept `logs`, `status` and `stop`
with `--release-dir` and `--env-file`; `stop` retains database/attachment/queue
volumes. Back up both database and storage, plus private keys. Never use `down -v`.

Import/image-check logs are saved under the selected release's
`.build-artifacts/.cache-logs/`. Initialization/startup are not automatically
logged: retain the failing command, exit code and relevant `logs` output if asking
the team for help. Redact secrets before sharing; never attach the runtime env file.

## What this does not prove or enable

The `1209dbd26` image passed native production build, module/worker checks and
in-memory SQLite verification. **A server deployment/init/browser smoke test has
not been performed.** It lacks later ToV sole-producer/native-intake integrations;
new runtime flags cannot add absent code. Its packaged tools/config are from
`13d8c0e85`; these new setup helpers do not modify that existing archive.

Agents and mail default off. No paid models, demo/real payments or publication are
enabled by this guide. Real signup needs separately configured/enabled mail;
live agents need an explicit model/key, scoped workflows and approved budgets.
The server profile is not the zero-charge local demo purchase harness. Startup
alone does not establish a usable first-order/payment flow.
