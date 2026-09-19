# Integration evidence

This complements story coverage: **what is wired, what actually ran, and where
the run stopped**. It is not a new application telemetry service or a pass gate.

- `expected.json`: source-backed agent IDs and expected handoffs. `connected`
  means a caller exists; `defined` means definition only; `gap` is a known missing
  handoff. None means executed. Update this map when adding/replacing agents.
- `schemas/`: closed journal event and expected-map contracts.
- `src/`: dependency-free writer, index and standalone HTML renderer.
- `journals/`: gitignored local JSONL runs, including interrupted/failed runs.
- `generated/`: sanitized shareable JSON index and `generated-report.html`.

From `App/`:

```powershell
node .dev-docs/integrations/src/cli.mjs
# After a collector has created local journal files:
node .dev-docs/integrations/src/cli.mjs --journal .dev-docs/integrations/journals
node --test .dev-docs/integrations/src/index.test.mjs
```

Omit `--journal` to build the source map with **no execution claims**. `--map` and
`--out` accept explicit paths. Open `generated/generated-report.html` directly.
Refresh reads supplied journal files only; it does not launch models or tests.

## Recording a journey

Import `appendEvent` from `src/journal.mjs`. Write one journal file per journey
run; use a stable run ID and explicit `fixture` or `live` mode. Record coarse
checkpoints and actual native results before the test deletes its own fixtures.
Use the same reader on success and in `finally` so failures keep their prefix.
Collector/write failure should be reported, not fail an otherwise working demo.

Events require `schemaVersion:1`, `runId`, UTC `time`, `journey`, `mode`, exactly
one `agentId`/`integrationId`/`checkpointId`, and `phase` (`started`, `completed`,
`waiting`, `failed`). Optional `reason` separates human/input/budget/configuration
waits from execution failure. `refs` contains native opaque IDs only; never emit
prompts, outputs, customer text, URLs with credentials, or exception bodies.

An agent's completed observation needs its persisted `agentRunId`. A completed
handoff needs `producerRunId` and `consumerRunId` or `userTaskId`, taken from the
actual saved lineage—not merely two runs in the same case. `outputVersionId`
records exact output when available. A model request alone proves neither
completion nor handoff. Checkpoints show progress but never prove agent execution.

Fixture and live evidence stay separate. Earlier success is retained alongside
later failure; last reached stage is not automatically a whole-run pass. Normal
waiting is not failure. Unknown agent/edge IDs and malformed journal lines remain
visible. No journal means unobserved, not broken. Records do not authenticate their
own provenance; honest collection from native results is the trust boundary.

The index is not the story acceptance count, an audit trail, or a replacement for
existing demo assertions. Keep only meaningful business-transition checks in the
demo. A collector does not invent success or require a coverage percentage.

Initial map: 31 registered `agency_research` agents and four `agency_tov` agents.
The standalone ToV pipeline has a missing app entry; source scout is CLI-only.
These are visible source gaps, not silently counted as canonical-demo coverage.
The initial generated report intentionally contains zero runtime observations.
T95 owns the actual journey collector; T96 owns its connected demonstration.
