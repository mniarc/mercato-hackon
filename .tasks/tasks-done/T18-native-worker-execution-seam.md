# T18 - Identify the reusable native worker boundary

State: done
Sources: F42-1, F45-1, F51-1, F54-1

The lower-level OSS typed-output path was investigated, but is not the selected
agency integration. [ADR-003](../../.dev-docs/adr/003-agency-worker-and-interaction-map.md)
selects the existing `agent_orchestrator` core used by ToV, without changing ToV
or creating an agency execution wrapper. Native workflows own business routing.
The selected agent path requires Enterprise; declared limits alone are not F51
compliance. This supersedes the initial direct-SDK implementation direction.

Implementation follows in [T19](T19-native-typed-triage-worker.md). No paid run or
complete live worker was claimed by this reuse analysis. Durable ownership remains
in [ADR-001](../../.dev-docs/adr/001-agency-feature-boundaries.md).
