# T18 - Identify the reusable native worker boundary

State: done
Sources: F42-1, F45-1, F51-1, F54-1

Native OSS `defineAiAgent` / `runAiAgentObject` support typed output and shared
model configuration without an Enterprise-only baseline. Durable business routing
stays in native workflows. Native object execution does not currently enforce
every declared time/token/retry budget; configuration alone is not F51 compliance.

Implementation follows in [T19](T19-native-typed-triage-worker.md). No paid run or
complete live worker was claimed by this reuse analysis. Durable ownership remains
in [ADR-001](../.dev-docs/adr/001-agency-feature-boundaries.md).
