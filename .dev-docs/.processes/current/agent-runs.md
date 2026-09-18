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

The case-to-ToV bridge is being integrated separately; provider configuration
alone does not prove that end-to-end path. See
[testing](testing.md) for the persistent runtime.
