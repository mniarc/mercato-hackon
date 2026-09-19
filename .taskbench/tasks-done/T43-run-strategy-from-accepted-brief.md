# T43 - Resume strategy from the accepted brief

State: done
Verification evidence: `292656115` and T58's headed TC-AGENCY-002 proof run the
teammate strategy/ToV phase after genuine brief acceptance, followed by explicit
pair acceptance and a plan invitation. Focused strategyExecution checks cover
exact inputs, rejected readiness, saved budget pauses and replay. Model/source
fixtures were used; paid execution and full STD-LIMITY enforcement are not proved.
Depends on: T41 exact acceptance; T42 readiness
Sources: F20-1, F21-1, F22-1, F23-1
Owns: `agency_research/lib/strategyExecution/**`; parallel owners extend existing `research/steps/{context,strategy,tov,strategyQa}.ts` and employee `agency_operations/lib/processProjection/**`, `AgencyCaseProcess.tsx` with adjacent tests; coordinator owns public service/native workflow wiring

Delivered native seam: `agency_operations/lib/strategyExecution/**` connects the existing native acceptance continuation. It reads explicit strategy spend authorization from the original process configuration; the analysis-only cap is not that authorization. It keeps the same business process, correlates execution to its acceptance, replays saved results, and exposes an interrupted/partial attempt instead of starting another paid run. This technical execution seam does not claim complete STD-LIMITY enforcement (T24).

## Deliver

- Add a phase-only service entry for 5.1 → existing teammate 5.2 → 5.3 → 5.4. Resolve T42 readiness before writes or model calls; never restart 3.1 or replace accepted/frozen inputs with latest versions.
- Reuse existing persisted order facts, teammate step persistence, QA repair loop, ledger and native orchestrator runner. Snapshot native process identity, exact input references, teammate repair limit and explicit caller spend cap in the 5.1 task.
- Keep exact generated strategy/ToV versions bound through QA and repairs. Produce no client acceptance and no automatic planning. Missing readiness/configuration is explicit; budget pauses retain persisted work.

## Done when

The trusted native caller can resume only the strategy phase with real persisted tasks/documents and receive exact pair/QA references. Focused checks cover rejected readiness, exact inputs, original step reuse and budget pause. No new provider, agent framework, schema, approval policy or live paid proof.
