# Manual agency walkthrough

Use the persistent local app and database; do not reset them for manual QA.
See [testing](testing.md) for installation/runtime details and
[agent configuration](agent-runs.md) for execution prerequisites.

## Start and choose a perspective

From the `App/` root in PowerShell, with the checkout installed:

```powershell
& .\bin-dev\agency.ps1 manual-fixture
```

Start only if the runtime owner confirms no app already owns the port. Leave its
terminal running. Startup reuses the sole active local scope and prints customer
and staff URLs. With several scopes, use `status --profile fixture` and explicitly
set both `AGENCY_MANUAL_TENANT_ID` and `AGENCY_MANUAL_ORGANIZATION_ID` first.
Use `http://localhost:5004` for manual fixture mode, not `127.0.0.1`; the latter can
leave development pages unhydrated. Use separate browser profiles for customer
and staff sessions. These are local routes, not a remotely accessible deployment.

| Perspective | URL path |
| --- | --- |
| Anonymous customer | `/acme-corp/portal/signup`, `/acme-corp/portal/login` |
| Customer offer / order | `/acme-corp/portal/agency`, `/acme-corp/portal/agency/order` |
| Customer materials / cases | `/acme-corp/portal/agency/materials`, `/acme-corp/portal/agency/cases` |
| Customer tasks and reviews | `/acme-corp/portal/tasks`; open the actual assigned task |
| Staff sign-in | `/login` |
| Employee inbox / cases | `/backend/work-inbox`, `/backend/agency-operations/cases` |
| Staff specialist ToV intake | `/backend/agency-operations/tov-intakes` |

`acme-corp` is the local organization slug; use the configured slug elsewhere.
The documented local seed staff login is `admin@acme.com` / `secret`, not a
customer account or production credential. Employee visibility depends on assigned
permissions; report a denial rather than treating a superadmin session as proof
that an ordinary employee can see it.

Create your own customer account or use an existing account whose credentials you
know; there is no universal customer password. Local signup email is captured, not
sent externally. In `ai-company/apps/mercato/.mercato/agency-manual-fixture/email-capture.jsonl`,
find your exact recipient's record and open its `/portal/verify?token=...` link
on the local app, then sign in. Do not share the capture file or verification token,
and do not bypass verification in the database.

## Persistent profile setup and execution contract

| Mode | App / PostgreSQL | Intelligence / retained runtime directory |
| --- | --- | --- |
| Existing development | 5002 / 5544 | Automated runner owns fixture provider; `agency-dev` |
| Manual fixture | 5004 / 5545 | Persistent local provider 5005; `agency-manual-fixture` |
| Manual live | 5006 / 5546 | Private central OpenRouter; `agency-manual-live` |

Each manual profile has its own Compose project/volume, database, queue,
attachments, cache, email capture and Next output. Generated module registration
and installed packages are shared: prepare them once with the runtime owner before
starting profiles; the manual launcher does not regenerate them. Ctrl+C stops only
its app, native queue workers and optional fixture companion; PostgreSQL/data remain.
Manual fixture setup, local provider readiness, native queue-worker startup and
app startup passed on 2026-09-19. Full manual clickthrough and live-model proof
remain pending. Do not launch a duplicate while the runtime owner keeps it running.

First-time fixture setup from `App/` (never a reset):

```powershell
& .\bin-dev\agency.ps1 setup --profile fixture
& .\bin-dev\agency.ps1 status --profile fixture
# Choose the intended actual local scope/staff IDs printed by status.
$env:AGENCY_MANUAL_TENANT_ID = '<tenant-id>'
$env:AGENCY_MANUAL_ORGANIZATION_ID = '<organization-id>'
$manualStaffId = '<authorized-staff-id>'
& .\bin-dev\agency.ps1 cli --profile fixture agency_operations configure-demo-purchase --tenant $env:AGENCY_MANUAL_TENANT_ID --organization $env:AGENCY_MANUAL_ORGANIZATION_ID --user $manualStaffId
& .\bin-dev\agency.ps1 cli --profile fixture agency_operations configure-triage --tenant $env:AGENCY_MANUAL_TENANT_ID --organization $env:AGENCY_MANUAL_ORGANIZATION_ID --user $manualStaffId
& .\bin-dev\agency.ps1 cli --profile fixture agency_operations configure-tov --tenant $env:AGENCY_MANUAL_TENANT_ID --organization $env:AGENCY_MANUAL_ORGANIZATION_ID --user $manualStaffId
& .\bin-dev\agency.ps1 cli --profile fixture agency_operations configure-employee-questions --tenant $env:AGENCY_MANUAL_TENANT_ID --organization $env:AGENCY_MANUAL_ORGANIZATION_ID --user $manualStaffId
& .\bin-dev\agency.ps1 cli --profile fixture agency_operations configure-analysis --tenant $env:AGENCY_MANUAL_TENANT_ID --organization $env:AGENCY_MANUAL_ORGANIZATION_ID --user $manualStaffId --policy-file '<approved-policy.json>'
& .\bin-dev\agency.ps1 manual-fixture
```

On later restarts, run only `manual-fixture`; keep the initialized database/configuration.
Scope environment assignments are needed only when choosing among several scopes.
Use the explicit policy contract in [agent configuration](agent-runs.md), matching
the actual demo offer/product version and configured phase budgets. Configure
employee-question/review capabilities required by that policy through their existing
native CLI commands. No budget, catalogue binding or approval is invented by the
launcher. Missing configuration remains a visible hold. Fixture mode supports the
representative FLOW corpus, not arbitrary company research: use its actual website
and social references from `agency_research/__fixtures__/flow/order.json`. Answer
invited questions with `QID: your answer` or the full question followed by your
answer. Unmatched answers remain unanswered; arbitrary private uploads produce no
fabricated facts. The current post fixture supports an actual selection of `TOP02`.

For live intelligence, privately configure the central OpenRouter environment in
`apps/mercato/.env` as [documented](agent-runs.md), including explicit native timeout/
retry controls. Remove stale fixture and module-model overrides. Initialize and
configure the separate `live` profile using the same commands and its own IDs;
live CLI execution requires `cli --profile live --allow-live ...`. Start **only
after explicitly accepting model charges**:

```powershell
& .\bin-dev\agency.ps1 manual-live --allow-live
```

Without that flag live start/CLI is refused. Live uses genuine intelligence, still
zero-charge demo purchasing and no publication sending. No live calls are part of
routine checks. Scope/policies and provider overrides must belong to the selected
profile; don't copy another database's IDs. Mode switching does not copy data.

Direct portable CLI contract from `ai-company/` is
`node scripts/agency-dev.mjs <start|setup|migrate|status|cli> --profile <fixture|live>`;
`--allow-live` immediately follows the live profile for CLI. Shell wrappers expose
the same arguments. Persistent manual profiles remain separate from automated
journeys; `test --profile ...` is intentionally unsupported.

The production automated journey has one explicit intelligence selector for the
same app and runner path. Fixture is the default and is pinned to the loopback
provider; it cannot fall back to a paid provider:

```powershell
& .\bin-dev\agency.ps1 start --journey production --intelligence fixture
& .\bin-dev\agency.ps1 demo --journey production --intelligence fixture
```

An approved live journey uses the same commands with `--intelligence live
--allow-live` in **both** terminals. Before starting either command, privately set
the central `OM_AI_PROVIDER=openrouter`, prefixed `OM_AI_MODEL`, real
`OPENROUTER_API_KEY`, and positive native timeout/retry variables documented in
[agent configuration](agent-runs.md). Do not set a custom provider base URL or
fixture-native flags. Also set absolute paths to:

- `AGENCY_JOURNEY_POLICY_FILE`: the reviewed native policy with explicit phase budgets.
- `AGENCY_JOURNEY_CLIENT_INPUT_FILE`: JSON containing explicit customer answers and
  the actual offered topic selection.

The live runner validates both files before intelligence execution; the launcher
never invents budgets or customer decisions. The FLOW source fixture may still
provide bounded source material—selecting live intelligence changes model calls,
not provenance. These commands can incur charges and are not routine checks.

## Prerequisites for continuing past purchase

An authorized runtime owner must configure the native demo catalogue/payment
binding and matching analysis/G workflows for this organization; the automated
test provisions its own fixtures, not a permanent manual customer scenario.
The manual purchase configuration command is documented in [testing](testing.md).

The `production` automated journey preset remains fixture-backed, not a live
deployment. Manual profiles instead keep native queue consumers running beside
the app; fixture mode starts its unpaid companion first. They never submit customer
decisions or seed completed research. Do not switch to live keys to unblock a
fixture error; report its exact unsupported input or failed step.

## Walk one real case

1. **Customer:** sign up, verify, and read the offer. Enter one company's purchase
   details and accept the displayed demo terms. Self-service onboarding creates
   the customer's own company; it does not join an existing company by name.
2. Submit the order and use only the available native zero-charge test-payment
   controls. The approved amount is simulated 2,500 PLN; no money is charged.
   A pending payment is not a paid case. Do not force payment failure for this path.
3. Open the resulting case, then Materials with that case selected (the route
   accepts `?caseId=<actual-id>`). Upload a small supported text file and optional
   message. It supplements the same case; do not submit internal agent JSON.
4. **Customer tasks:** when real research creates questions, answer them. Review
   the resulting brief and explicitly accept it. Staff upload the normalized
   public-post corpus for that same case at `/backend/agency-operations/tov-intakes`;
   the authoritative specialist result is required. Then review and accept the
   strategy/ToV pair, select a plan topic, and review the generated post. Use the
   actual invitation each time, not guessed task IDs or fabricated approvals.
5. **Employee:** open the same case and inspect its saved process, research ledger
   and versions. Use the inbox when an actual exception requires staff. Missing
   configuration/input should remain an explained hold; report unexpected errors
   or stalled work without marking it successful or restarting the whole order.
6. **Consent/preparation:** content acceptance is not publication consent. A real
   scoped destination must already be configured. Requesting a separate consent
   task currently uses the authorized staff API, not a claimed UI button:
   `POST /api/agency_operations/cases/<id>/publication-consent` with
   `{"postVersionId":"<actual-approved-version-id>"}`. The customer responds in
   their assigned portal task. Inspect saved preparation; `canSend:false` remains
   mandatory. No Discord send, real payment or publication is part of this guide.

The latest extended joined demo still requires its complete confirming run;
earlier passing variants do not establish every newer consent/recovery path.
Observe genuine failures when they occur; do not manufacture or conceal them.

## Evidence

Capture-only artifacts live in `App/.visuals/capture-*/customer/` and `employee/`;
the tool retains the latest five qualifying runs. Automated demo screenshots are
separate, under `ai-company/.ai/qa/test-results/`, and may be replaced next run.
For a finding, record just the step, URL, expected/actual result and relevant PNG
(redact private information). Hand visual defects to the teammate UI owner.

Use the named profiles above for separation, not a second app pointed at the same
database. None is started merely by reading this guide or preparing its source.
