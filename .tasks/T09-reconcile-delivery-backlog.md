# T09 - Reconcile the delivery backlog

State: done
Depends on: none
Owns: `.tasks/**`, `.dev-docs/adr/**`
Context: Refresh the backlog against current code, integrated teammate work, and actual verification.

## Deliver
- Correct task states and remaining scope; identify superseded or duplicate work.
- Keep completed work concise. Record only durable milestone/domain-level architectural decisions in ADRs, never one ADR per completed item.

## Done when
- The queue distinguishes completed, superseded, and genuinely remaining work with brief evidence.

## Constraints
- No product/spec/process edits, runtime operations, tests, staging, or commits.
- Do not infer completion from implementation alone when the task requires an unproven runtime outcome.

## Evidence

Reconciled existing tasks against main, locally known teammate refs, source, and
coordinator verification. Completed implementation/logging is separated from the
remaining shared browser/restart proof. ToV persistence is recognized as existing
teammate work awaiting integration, not duplicated. Two feature-level ADRs capture
[agency ownership](../.dev-docs/adr/001-agency-feature-boundaries.md) and
[persistent development](../.dev-docs/adr/002-persistent-development-runtime.md);
task evidence remains at its original paths. No specs, product code, or process
files changed, and no runtime checks were launched by this reconciliation.
