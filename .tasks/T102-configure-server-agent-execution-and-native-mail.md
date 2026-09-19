# T102 - Configure server agent execution and native mail

State: done
Sources: user-requested runnable Linux deployment; native triage configuration,
ToV execution gate and Resend system-email preset. Deployment support, not new story coverage.
Owns: `ai-company/docker/agency/{compose.yml,runtime.env.example}`, narrow
`bin/agency.mjs` validation/tests, existing deployment guidance.

## Deliver

Explicitly pass supported opt-in agent flags, native bounds, central model/key
and Resend mail settings into the container. Default execution and mail off;
retain disabled demo payments/publication. Reject incomplete enabled setup without
provider calls. No arbitrary env-file forwarding, runtime changes or image rebuild.

## Done when

Isolated command checks cover opt-in/disabled setup and missing credentials/bounds.
Portable package owner receives frozen configuration; documentation distinguishes
image contents, configured execution and actual live proof.
