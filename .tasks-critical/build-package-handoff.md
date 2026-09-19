# Build/package handoff — verify a portable server bundle

State: ready for takeover; image verification, archive and deployment proof pending.

Goal: deliver one verified, secret-free release tar that another developer can
extract, import and boot on Linux Docker without the development checkout.
Fix reproducible build/package/startup defects; this is not a request for broad
refactoring or paid model calls.

## Starting evidence — 2026-09-19 16:54 UTC

- Frozen baseline: `agency-app:1209dbd26`, built from revision `1209dbd26`.
  Current main has newer specialist ToV/strategy and connected navigation work;
  the baseline image does not automatically contain those integrations.
- Saved BuildKit history reached image export: layers, manifest/config and naming
  completed; its last line is `unpacking to docker.io/library/agency-app:1209dbd26`.
  That log has no final success record. No image/release `.tar` was present under
  `.build-artifacts/` at this observation. This is a dated snapshot, not a claim
  that the build is permanently stuck; check the existing owner's result first.
- Evidence: `.build-artifacts/.cache-logs/build-1209dbd26-history.log`.
  The other short history log records a failed history lookup, not a build failure.
  Do not restart an existing build merely because its console is quiet.

## Prerequisites and takeover

Read [deployment](../.dev-docs/.processes/current/deployment.md) for exact runtime,
mail, security and update rules; [demo guide](../.demo-docs/guide.md) describes
the separate local fixture journey. Packaging is not proof of that whole journey.

Builder: Node.js 24; Windows PowerShell 5.1+ with Docker Desktop in **Linux
containers** mode, or a Linux Docker Engine host; Compose v2. Use an isolated
checkout so builds do not disturb the active demo. Agree the target revision and
immutable image tag with the current owner before starting; never relabel the
old baseline as newer main. Allow disk space for image, image tar and outer tar.

Receiver: Docker Engine/Compose v2, Node.js 24 and tar extraction. The bundle is
a prebuilt-image deployment surface, not a server-side build kit. It includes
`QUICKSTART.txt`; no source checkout, model key or private env file is bundled.

## Short command path

From `App/`, PowerShell example (replace `REV` and use absolute archive paths).
Skip build if the intended immutable image already finished successfully:

```powershell
& .\bin\agency.ps1 build --image agency-app:REV
& .\bin\agency.ps1 verify-image --image agency-app:REV
& .\bin\agency.ps1 export --image agency-app:REV --file D:\releases\agency-app-REV.tar
node .\bin\package-release.mjs --image agency-app:REV --image-file D:\releases\agency-app-REV.tar --output D:\releases\agency-release-REV.tar
```

Stop on a failed command. The outer output file must not already exist.
On Linux replace `& .\bin\agency.ps1` with `sh bin/agency.sh`.
After transfer/extraction, run from the bundle directory; create a private env
file from its runtime template, set the exact `AGENCY_IMAGE` and independent
secrets/passwords, and follow deployment instructions for mail configuration:

```sh
sh bin/agency.sh import --file /absolute/path/to/agency-app-REV.tar
sh bin/agency.sh preflight --env-file /etc/agency/runtime.env --for init
sh bin/agency.sh up --env-file /etc/agency/runtime.env --service postgres
sh bin/agency.sh init --env-file /etc/agency/runtime.env --organization "Our Agency"
sh bin/agency.sh up --env-file /etc/agency/runtime.env
sh bin/agency.sh status --env-file /etc/agency/runtime.env
```

`init` is only for a new empty database. Existing deployments use the documented
backup/migrate sequence, not reinstall/reset or `down -v`. Keep paid agents, demo
payments, test fixtures and publication disabled in this server profile.

## Evidence to return

New build/verify/export/import/package invocations log automatically under
`.build-artifacts/.cache-logs/` in the checkout or extracted bundle. Runtime/init
commands do not: capture their exit and relevant `agency.sh logs --service app`
output separately. Review/redact before sharing; never include env files/tokens.

For a defect, report source revision + image tag/digest, host/Docker versions,
exact failing command, first useful error/stage, exit code, log path and minimal
reproduction. Note whether failure is build, verify, archive, import, init or boot.
A partial archive or a log without a terminal record is not successful delivery.

Done means: build exits successfully, `verify-image` passes, both archives exist,
the outer tar extracts and its image imports on the receiver, native first init
and app/database healthchecks pass, and authenticated staff UI opens. Record the
tested revision/environment and remaining limits. Image verification alone is
offline inspection, not boot proof; this task does not claim email delivery,
latest full customer journey, live-model quality or real publication was tested.
