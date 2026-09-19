# P0 - Deliver the current connected agency release

State: active
Branch: `main` after user-requested consolidation from `main-indev`.
Source: user-approved `.task-seed.md`; no new product policy.

## Parallel delivery tasks

- [T98](../../.tasks/T98-bind-strategy-to-authoritative-tov.md): finish client/QA correction -> authoritative specialist revision -> fresh pair QA/review. Initial producer/strategy integration already exists.
- [T95](../../.tasks/T95-share-fixture-and-live-agent-journey-harness.md) + [T96](../../.tasks/T96-prove-and-integrate-shared-agent-harness.md): dual fixture/live harness is source-integrated, NOT fully proved. Run the same real flow in fixture mode, retain native evidence, fix observed blockers; check live selection/gating without paid calls. Do not rebuild the harness.
- [T103](../../.tasks/T103-connect-specialist-source-discovery.md): connect the existing teammate source scout to scoped specialist intake; preserve supplied-corpus intake.
- [T104](../../.tasks/T104-collect-missing-native-handoffs.md): record missing handoffs from saved native lineage; leave conditional/unexecuted paths unobserved.
- [T93](../../.tasks/T93-persistent-manual-fixture-and-live-modes.md): prove the persistent unpaid manual profile and prepare the separate live profile. Runtime owner serializes this with T96, not feature implementation.
- [T105](../../.tasks/T105-package-and-boot-current-integrated-release.md): prepare release now; build one integrated checkpoint after source freeze, then prove clean boot without touching development data.

## Execution boundary

Direct agents own disjoint implementation islands; use detached worktrees during
the shared-runtime proof so hot reload cannot pick up unfinished changes. One
runtime owner handles app/DB/generators/browser and one coordinator owns Git.
Use PowerShell workers only when direct capacity is exhausted and the island is
detached; never for shared runtime operations. No broad audit or duplicate tests.

Review each handoff once, integrate coherent work, run affected checks, commit.
Keep intelligence fixtures separate from native producers, approvals and stored
results. No paid calls, real charges, publication, or database resets. Latest full
fixture proof, manual proof, package boot and live proof are distinct outcomes.
