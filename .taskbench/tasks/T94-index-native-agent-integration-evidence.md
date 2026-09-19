# T94 - Index native agent integrations and journey observations

State: active
Tool implemented with six focused checks passing; native collector/proof is
delegated to T95/T96. Initial generated report contains zero observed runs.
Sources: user request for every teammate agent's connected execution evidence;
existing canonical demo and native agent/workflow contracts (no new business policy).
Owns: `.dev-docs/integrations/**`; coordinator assigns demo collector separately.

## Deliver

- Source-backed expected agent/handoff map, separate from runtime observations.
- Small closed JSONL schema and writer for native IDs only, no customer payloads.
- Local index/standalone HTML showing fixture vs live observations, failed/partial
  runs, normal waiting, last reached checkpoint and unknown IDs.
- Collect actual native persisted results before journey fixture cleanup; never
  infer execution from source registration or a model request alone.

## Done when

Focused tool tests demonstrate honest proof classification and retained partial
runs; a demo collector emits actual persisted IDs into the journal and generated
report. No live calls, telemetry service, extra database or coverage gates.
