# Agent runs: native runtime and OpenRouter

Team integration point: use Open Mercato's native agent runtime/model factory,
not separate OpenRouter clients in individual modules. The app's ignored `.env`
(deployment: injected environment) owns the shared provider, model and key;
`.env.example` carries only the non-secret defaults for teammates.

The current agency demo remains deterministic. Configuring a key does not switch
it to live agents. Native agent runs are an explicit next-slice opt-in and incur
provider charges; do not run them as part of routine tests.

## Configure before an approved live run

Use the existing server environment, not a new provider store. Edit your ignored
`ai-company/apps/mercato/.env` locally (merge these lines; do not replace the file),
or inject the same variables through your deployment's secret manager:

```dotenv
OPENROUTER_API_KEY=
OM_AI_PROVIDER=openrouter
OM_AI_MODEL=openrouter/mistralai/mistral-nemo
```

Fill the key privately. Mistral Nemo is the cheap development smoke candidate,
not a quality-demo commitment; its compatibility with our output schemas still
needs a live proof. For the final demo change **only `OM_AI_MODEL`** to an exact
OpenRouter model ID prefixed with `openrouter/`, then restart app and workers.
The explicit `openrouter/` prefix pins the
provider even when its key is missing; the platform strips that prefix before
sending the model ID. No custom base URL is required. `OPENROUTER_BASE_URL` is
only for an intentional gateway override.

These are the app-wide defaults. Agency workers must inherit them, not hardcode
models or supply caller overrides. Leave `OM_AI_AGENCY_TOV_MODEL`/`PROVIDER`
and other module overrides unset for this shared-default setup (remove them if
you followed the earlier module-scoped example). Existing tenant/per-agent
overrides, agent defaults and allowlists can affect the effective selection;
inspect native AI settings/run metadata if another model is reported. Keys stay server-side: never use
`NEXT_PUBLIC_*`, commit a filled example, paste keys into tasks/chat, or log them.
Restart the app and workers after changing their environment.

Research tiers also inherit `OM_AI_MODEL`. Leave
`OM_AGENCY_RESEARCH_MODEL_EXTRACT`, `_SYNTHESIS`, and `_QA` unset unless deliberately
overriding a tier. Native module/tenant overrides still take precedence.

The model factory already rejects an explicitly pinned, unconfigured provider
(`AiModelFactoryError`); do not catch that as a successful no-op or silently fall
back to another provider. A configured key is not proof of credit, model access,
or model/schema compatibility. Those need one deliberately approved live smoke.

## Runtime prerequisites, once for the next slice

- Confirm the team's entitlement to the enterprise `agent_orchestrator` module.
  The app enables it and `agency_tov` with both
  `OM_ENABLE_ENTERPRISE_MODULES=true` and
  `OM_ENABLE_ENTERPRISE_MODULES_AGENTS=true`.
- The coordinator enables those flags consistently for generation, app, workers,
  and CLI; generates registrations and applies the required migrations to the
  existing development database. No database reset. Do not enable unrelated SSO
  or security overlays for this slice.
- With `yarn dev:agency`, pass activation flags in the launching process:
  its shared test environment otherwise supplies an explicit enterprise-off
  default, which takes precedence over dotenv. Keep
  `OM_ENABLE_ENTERPRISE_MODULES_SSO=false` and
  `OM_ENABLE_ENTERPRISE_MODULES_SECURITY=false` explicit too.
- Run CLI work from `ai-company` with `node scripts/agency-dev.mjs cli ...` to
  inherit the same owned database/runtime environment. A bare `yarn mercato ...`
  can read another `DATABASE_URL` from `.env`. Pass explicit tenant, organization,
  and user IDs.

ToV's existing `agency_tov run --runner orchestrator --persist` is the native
path. Start with a small supplied corpus (`--file`, `--limit`, `--concurrency 1`)
and a private output/cache directory. `--scrape` adds Apify usage; `--discover`
adds live web research and its provider/ACL requirements. Neither is needed for
the first proof. **`--runner direct` bypasses native run tracing/controls**;
`--model`, `--synthesis-model`, and `OM_AGENCY_TOV_*` model variables configure
that direct path only, not the native path above.

## Integration seam

Server callers resolve `agencyTovResearchService` from DI and call
`run({ context, brand, outputLanguage, posts })`. Pass normalized ToV posts and
an explicit native execution identity (tenant, organization, staff/principal user;
workflow correlation when applicable). It requires `agency_tov.manage` and
`agent_orchestrator.agents.run`, persists research/documents and returns exact
`researchRunId`, `documentVersionIds`, `agentRunIds` plus the pipeline result.
Types live in `agency_tov/lib/researchService.ts`; no filesystem or provider SDK
is needed by callers. Identity/text conflicts in immutable corpus fail explicitly.
Agency operations owns routing/reference links; ToV retains prompts and research.

For durable business execution use the existing workflow/`INVOKE_AGENT` and
`agent_orchestrator.processes.startExecution` contracts; the synchronous agent
run endpoint is for diagnostics, not a second business execution engine.
Model-directed delegation already exists: `defineAgent({ subAgents: [...] })`
adds `agent_orchestrator.delegate_agent`, retaining scoped ACLs and parent-run
links. Targets must return research and cannot delegate again. ToV's bounded
map/reduce is already parallel; do not replace it with an LLM dispatcher merely
to demonstrate delegation.

## Run research from a client case

With the activation flags above, configure the native workflow once per scope:

```powershell
node scripts/agency-dev.mjs cli agency_operations configure-tov --tenant <uuid> --organization <uuid> --user <granting-staff-uuid>
```

The granting staff user must hold the requested native research permissions.
Start the app/workers with `AGENCY_TOV_EXECUTION_ENABLED=true` only when live
execution is intended. In Materials select tone-of-voice research, brand and
output language; upload a JSON array of 1–100 normalized ToV posts (max 1 MiB).
Omitting the process keeps the deterministic intake baseline. Missing activation
or workflow setup rejects research rather than silently substituting a no-op.
Native workflow state and persisted research/run references are authoritative.

The bridge/configuration and deterministic demo are verified independently;
an end-to-end paid OpenRouter run still requires its own explicit smoke proof.
See [testing](testing.md) for the persistent runtime.

## Case analysis through teammate research (opt-in)

After coordinated module generation/migration, configure the scope as authorized staff:

```powershell
node scripts/agency-dev.mjs cli agency_operations configure-analysis --tenant <uuid> --organization <uuid> --user <granting-staff-uuid> --policy-file <approved-policy.json>
```

Policy JSON requires `through` (`3.2`, `3.5`, `3.8`, or `4.2`), positive `maxCostPln`,
and `productSelection` matching the actual offer, including explicit
`result_limits.topics`. It is stored in the native workflow definition; subsequent
changes require native version publishing. This is execution permission, not
proof of payment or customer acceptance. The research service's budget accounting
is not a provider-enforced billing ceiling.

Enable `AGENCY_ANALYSIS_EXECUTION_ENABLED=true` only for approved execution. The
existing portal materials API accepts `process: {"kind":"analysis"}` and a private
JSON file containing `order` plus optional `socialPosts`/`pages`, using the teammate
`researchRunRequestSchema` shapes. Clients cannot supply execution policy. Uploaded
product selection must match the configured policy; baseline and ToV are unchanged.

The native workflow calls `agencyResearchService`, saves exact task/document/agent
references, and exposes them in the employee case process view. Incomplete QA or
budget outcomes stay waiting; no customer approval is inferred. Targeted supplements
and automatic recovery of partially persisted research are not implemented: reconcile
existing runs instead of rerunning the full analysis. Code checks are separate from
the pending live runtime proof; do not activate this in an occupied development runtime.

## Native client triage (opt-in; local-intelligence proof passed)

With the same Enterprise prerequisites, configure the scope once:

```powershell
node scripts/agency-dev.mjs cli agency_operations configure-triage --tenant <uuid> --organization <uuid> --user <granting-staff-uuid>
```

This grants only `agent_orchestrator.agents.run` to the native workflow identity.
Configuration refuses to overwrite an existing definition; changes use native
workflow version publishing. Native triage currently permits only the explicit
localhost intelligence fixture; live activation fails with an unsupported-limits
error. Client submissions in fixture mode use `INVOKE_AGENT`;
clients cannot select workers. Answer/clarify can route; other typed results are
saved as explicitly unapplied. Agent failure enters a native employee UserTask;
its sole resolution decision returns to the original triage input.

Keep the flag false for the deterministic baseline. Prompts and the shared model
environment are not pinned by workflow versioning. Native run timeout does not
cancel an in-flight provider request; activity timeout/retry settings are not
agent budgets. No monetary/token cap is enforced by this binding. Paid execution
is blocked until native enforcement and approved versioned bounds exist, followed
by a separately approved live proof; opt-in cannot bypass that gap.

The canonical headed demo passed on the persistent database: native clarification,
client reply, controlled provider failure, authorized employee resolution, same-workflow
retry and fixture cleanup. Only intelligence was substituted. For this unpaid proof,
set `AGENCY_TEST_NATIVE_TRIAGE=1` in both app and test terminals, configure the workflow
above once, then run `yarn test:agency:headed`. The runner pins a dummy credential,
loopback provider (including the higher-priority `AGENCY_OPERATIONS_AI_BASE_URL`)
and model allowlist; the test owns that temporary provider server.
This mode is for the demo run, not unattended manual usage after its provider closes.
