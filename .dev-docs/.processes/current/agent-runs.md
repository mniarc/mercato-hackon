# Agent runs: native runtime and OpenRouter

The current agency demo remains deterministic. Configuring a key does not switch
it to live agents. Native agent runs are an explicit next-slice opt-in and incur
provider charges; do not run them as part of routine tests.

## Configure before an approved live run

Use the existing server environment, not a new provider store. Edit your ignored
`ai-company/apps/mercato/.env` locally (merge these lines; do not replace the file),
or inject the same variables through your deployment's secret manager:

```dotenv
OPENROUTER_API_KEY=
OM_AI_AGENCY_TOV_PROVIDER=openrouter
OM_AI_AGENCY_TOV_MODEL=openrouter/<vendor>/<model-id>
```

Fill the key privately and replace `<vendor>/<model-id>` with an exact model ID
available to your OpenRouter account. The explicit `openrouter/` prefix pins the
provider even when its key is missing; the platform strips that prefix before
sending the model ID. No custom base URL is required. `OPENROUTER_BASE_URL` is
only for an intentional gateway override.

These module-scoped settings leave other agents unchanged. For a deployment-wide
default, use `OM_AI_PROVIDER` and `OM_AI_MODEL` instead. Existing tenant/per-agent
overrides and allowlists can affect the effective selection; inspect the native
AI settings if a different model is reported. Keys stay server-side: never use
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
- Run CLI work with the same database/runtime environment as the app. A bare
  `yarn mercato ...` can read another `DATABASE_URL` from `.env`; never assume it
  targets `dev:agency`. Pass explicit tenant, organization, and user IDs.

ToV's existing `agency_tov run --runner orchestrator --persist` is the native
path. Start with a small supplied corpus (`--file`, `--limit`, `--concurrency 1`)
and a private output/cache directory. `--scrape` adds Apify usage; `--discover`
adds live web research and its provider/ACL requirements. Neither is needed for
the first proof. **`--runner direct` bypasses native run tracing/controls**;
`--model`, `--synthesis-model`, and `OM_AGENCY_TOV_*` model variables configure
that direct path only, not the native path above.

## Integration seam

Reuse ToV's `runTovPipeline` with its injected `TovAgentRunner`, backed by DI
`agentRuntime.run(agentId, input, scopedContext)`. Keep research/prompts/corpus
and document versions in `agency_tov`; agency operations owns case-to-run links
and routing. Use `onRunPersisted` to capture run IDs, never a newest-run query.

For durable business execution use the existing workflow/`INVOKE_AGENT` and
`agent_orchestrator.processes.startExecution` contracts; the synchronous agent
run endpoint is for diagnostics, not a second business execution engine.
Model-directed delegation already exists: `defineAgent({ subAgents: [...] })`
adds `agent_orchestrator.delegate_agent`, retaining scoped ACLs and parent-run
links. Targets must return research and cannot delegate again. ToV's bounded
map/reduce is already parallel; do not replace it with an LLM dispatcher merely
to demonstrate delegation.

The case-to-ToV bridge remains queued in the task backlog. See
[testing](testing.md) for the persistent runtime.
