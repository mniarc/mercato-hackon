# Agency demo: presenter guide

See the [architecture overview](architecture.md) for components and ownership.
To install the packaged app on a server, use the
[server setup guide and PowerShell/Bash helpers](server-setup/guide.md).

## What this demonstrates today

The app connects customer purchase/materials/reviews with native workflows,
persisted research and employee work. The `production` journey name means the
full production **process**, not live models: its intelligence/source responses
are unpaid fixtures. UI, authentication, payments through the zero-charge test
gateway, producers, approvals, database and workflow transitions remain real.

The sole `agency_tov` specialist integration passed 174 focused checks and app
typechecking; navigation passed 38 focused checks. The shared fixture/live harness
and native-run collector are integrated, with seven focused harness checks and
typechecking passed; the updated full fixture journey has not run. An earlier
full demo passed, but it does **not** prove
the latest whole journey. Present a current run's actual checkpoints; report a
hold/failure rather than calling an unfinished step successful. Nothing sends a
publication; `canSend:false` remains the boundary.

## Run the visible automated walkthrough

Use an installed checkout on Windows with Node.js 24, the repository-pinned
Yarn 4 (currently 4.17.1), Docker Desktop/Compose running, and the Playwright
browser installed. Ask the runtime owner to prepare package builds, generated
registrations and migrations once; see [development setup](../.dev-docs/.processes/current/testing.md).
These commands are not an installation or a database reset.

From `D:\Flow-OpenMercato\App` (or your team's `App` checkout), terminal 1:

```powershell
& .\bin-dev\agency.ps1 status
& .\bin-dev\agency.ps1 start --journey production
```

Check with the runtime owner before starting: reuse an existing matching app,
never launch a duplicate on port 5002. Leave its owning terminal open. Once ready,
terminal 2, from the same directory:

```powershell
& .\bin-dev\agency.ps1 demo --journey production
```

This opens a **headed browser** and saves checkpoint screenshots. Both commands
must select the same journey. Do not run competing demos/builds against it.
The named `agency_dev` database on port 5544 is retained; Ctrl+C stopping the app
does not erase it. The journey cleans only its own fixtures. Do not use this
automated fixture provider as a permanent manual agent service.

## Customer and employee views

Use `http://localhost:5002`, not `127.0.0.1`, and separate browser profiles for
customer/staff sessions. The local seed staff login is `admin@acme.com` / `secret`
at `/login`; it is neither a production credential nor a customer password.

- Customer signup/login: `/acme-corp/portal/signup`, `/acme-corp/portal/login`.
- Offer/order: `/acme-corp/portal/agency`, `/acme-corp/portal/agency/order`.
- Materials/cases: `/acme-corp/portal/agency/materials`, `/acme-corp/portal/agency/cases`.
- Assigned reviews: `/acme-corp/portal/tasks`; open the actual invitation.
- Employee cases/inbox: `/backend/agency-operations/cases`, `/backend/work-inbox`.
- New specialist intake (integration still being verified):
  `/backend/agency-operations/tov-intakes`.

`acme-corp` is the local organization slug. For a manual customer, create your own
account; there is no universal customer password. Local verification email is
captured in `ai-company/apps/mercato/.mercato/agency-dev/email-capture.jsonl`.
Open only your recipient's verification link on the local app, then sign in.
Do not share tokens or bypass verification. Staff visibility still requires permissions.

## Intended end-to-end story

1. Customer signs up, verifies email and enters their company details.
2. Read the fixed offer/terms, place an order and confirm the zero-charge demo
   payment (simulated 2,500 PLN). Pending payment is not a paid case.
3. Open the resulting case and upload supported material to that same case.
4. Real research raises questions; the customer supplies their own answers.
5. Review the resulting brief and explicitly accept its exact version.
6. Staff provide the normalized public-post corpus through the specialist intake
   for the same paid case. The authoritative `agency_tov` specialist produces ToV;
   strategy consumes that saved result. Review/accept the strategy–ToV pair.
   Missing specialist input/result is a hold, not a substitute research ToV writer.
7. Review the plan, choose a topic and review the actual generated post.
8. Staff inspect the same case, saved versions and process; real exceptions appear
   in the employee inbox. Do not mark a blocked task complete to advance the demo.
9. Accept post content. Staff explicitly configure a scoped destination; separate
   exact-version/target publication consent uses its own customer task when needed.
   Inspect preparation, not a send: content approval alone grants no publication consent.

## Persistent manual modes

Manual fixture **http://localhost:5004** (provider 5005) passed native setup,
workflow configuration, provider and persistent queue-worker/app startup on
2026-09-19. Full manual clickthrough remains unproved; manual live **5006** has
not been started. Follow the [operator walkthrough](../.dev-docs/.processes/current/manual-qa.md)
for first-time setup/configuration. On restart, run `status --profile fixture`,
set `AGENCY_MANUAL_TENANT_ID` and `AGENCY_MANUAL_ORGANIZATION_ID` to that profile's
printed IDs, then `manual-fixture`; do not start a duplicate app.
Each profile retains its own database, queues, attachments and email capture.
Manual signup verification uses `ai-company/apps/mercato/.mercato/agency-manual-fixture/email-capture.jsonl`.

Manual fixtures currently support the representative FLOW corpus, exact invited
`QID: answer`/question-bound answers, and the actual selected topic `TOP02`.
Arbitrary uploads must not fabricate facts. These are fixture limits, not product rules.
The demo uses existing global execution limits (`agency_research/data/templates.ts`)
and configured workflow caps. No per-case limits version or additional approval
step is required; production version pinning is deferred in T24. Existing safety
controls and explicit opt-in for paid execution remain unchanged.
Live mode uses private `ai-company/apps/mercato/.env` central OpenRouter settings;
see [agent configuration](../.dev-docs/.processes/current/agent-runs.md). `manual-live --allow-live`
requires explicit paid-call approval and configured native policies. This guide
does not authorize spending; live quality and the new joined path remain unproved.

## Evidence and sharing

Screenshots: `ai-company/.ai/qa/test-results/artifacts/`; browser report:
`ai-company/.ai/qa/test-results/html/`. These are latest-run files: save selected
evidence before another run replaces it. Separate manual captures live in `.visuals/`.
The [integration report](../.dev-docs/integrations/generated/generated-report.html) distinguishes
source wiring from fixture/live execution. It includes imported teammate live runs
and local fixture observations; neither proves every current connected-app path.
For server packaging use [deployment instructions](../.dev-docs/.processes/current/deployment.md).
The frozen `1209dbd26` image and portable bundle have passed build, offline
verification and packaging. They exclude later main integrations; clean server
startup remains unproved. See the [server setup guide](server-setup/guide.md).
