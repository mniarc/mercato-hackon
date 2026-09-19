# Manual agency walkthrough

Use the persistent local app and database; do not reset them for manual QA.
See [testing](testing.md) for installation/runtime details and
[agent configuration](agent-runs.md) for execution prerequisites.

## Start and choose a perspective

From the `App/` root in PowerShell, with the checkout installed:

```powershell
& .\bin-dev\agency.ps1 status
& .\bin-dev\agency.ps1 start --journey production
# Separate terminal: automated headed walkthrough with screenshots, not manual mode
& .\bin-dev\agency.ps1 demo --journey production
```

Start only if the runtime owner confirms no app already owns the port. Leave its
terminal running. Use `http://localhost:5002`, not `127.0.0.1`; the latter can
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

`acme-corp` is the local organization slug; use the configured slug elsewhere.
The documented local seed staff login is `admin@acme.com` / `secret`, not a
customer account or production credential. Employee visibility depends on assigned
permissions; report a denial rather than treating a superadmin session as proof
that an ordinary employee can see it.

Create your own customer account or use an existing account whose credentials you
know; there is no universal customer password. Local signup email is captured, not
sent externally. In `ai-company/apps/mercato/.mercato/agency-dev/email-capture.jsonl`,
find your exact recipient's record and open its `/portal/verify?token=...` link
on the local app, then sign in. Do not share the capture file or verification token,
and do not bypass verification in the database.

## Prerequisites for continuing past purchase

An authorized runtime owner must configure the native demo catalogue/payment
binding and matching analysis/G workflows for this organization; the automated
test provisions its own fixtures, not a permanent manual customer scenario.
The manual purchase configuration command is documented in [testing](testing.md).

The `production` journey preset means **fixture-backed process demonstration**,
not live/production deployment. Its loopback intelligence server and job drains
are owned by the automated runner and stop with it. Starting the app alone does
not provide an always-on manual agent worker. Before promising an uninterrupted
manual journey, the runtime owner must supply a supported persistent unpaid
intelligence/worker setup; that setup is not established by the commands above.
Until then, use the headed automated demo for connected execution, and manually
inspect persistent cases that actually exist. Do not switch to live keys to
unblock QA: paid calls remain unauthorized.

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
   the resulting brief and explicitly accept it; then review and accept the
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

## Evidence and an optional separate instance

Capture-only artifacts live in `App/.visuals/capture-*/customer/` and `employee/`;
the tool retains the latest five qualifying runs. Automated demo screenshots are
separate, under `ai-company/.ai/qa/test-results/`, and may be replaced next run.
For a finding, record just the step, URL, expected/actual result and relevant PNG
(redact private information). Hand visual defects to the teammate UI owner.

A second instance can isolate manual QA from development restarts and test fixture
cleanup, but a second browser or app port alone is not isolation. It needs its own
port, launcher/runtime identity and database/queue/storage scope. No separate
manual-QA instance/profile is configured or started by this guide; coordinate it
with the runtime owner instead of launching a competing copy against the same DB.
