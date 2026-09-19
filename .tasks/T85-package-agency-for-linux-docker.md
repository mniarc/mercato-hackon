# T85 - Package the agency app for a Linux Docker server

State: active; Linux Docker target confirmed, isolated build proof pending
Owns: `bin/agency.{ps1,sh,mjs}`, `ai-company/docker/agency/**`; agreed native Dockerfile/context changes
Source: user-requested server deployment; existing Open Mercato Docker/build/runtime contracts

## Deliver

- Reuse the native root Dockerfile and `yarn build`; include agency research/ToV and
  orchestrator at generation/build and runtime, without changing development defaults.
- Provide a small Linux Docker deployment entrypoint with persistent PostgreSQL,
  attachments and queue data; runtime-only secrets and separate native init/migration commands.
- Team-root PowerShell/Bash commands share one native command planner: build, offline image
  verification, read-only preflight, startup, explicit init/migrate, status/logs and safe stop.
- Keep test fixtures, local runtime data and secrets out of build context. Paid agents,
  real payment and publication are not authorized by packaging.

## Done when

- An isolated checkout/container builds the actual native image and verifies required
  agency registrations/artifacts, without modifying the running demo's `.mercato`.
- The team has exact build/start/migration commands. No deployment, production database
  mutation, domain/TLS choice or registry/CI automation is implied without approval.
