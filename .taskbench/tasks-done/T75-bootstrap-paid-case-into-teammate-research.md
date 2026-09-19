# T75 - Hand the paid case to the teammate research process

State: done
Sources: F05-2 AC1, AC3-5; P0 user direction to connect teammate processes
Owns: `agency_operations/lib/paidCaseAnalysis/**`; minimal purchase-confirmation,
receipt and analysis-material hooks. Coordinate supplementary materials with T74.

After native payment and purchase activation commit, hand the same case to the
existing native analysis workflow and `agencyResearchService.run`. Map the saved
purchase buyer/order/terms literally; preserve its private attachment and purchase
workflow history. Use only matching staff-owned product selection, explicit result
limits and execution caps. Missing/disabled/mismatched policy is a visible hold,
not a completed process or a customer request for internal JSON.

Replay must reuse the same case/workflow without restarting research. No new
agents, engine, inferred approvals, default budgets, paid calls or analysis inside
the payment transaction. F05-2 AC2's versioned STD-LIMITY and WEW-ZMIANY document
contract remains outside this bounded connection and is not claimed complete.

Done when focused binding/replay checks verify the real after-commit call chain;
the coordinator separately verifies the native purchase-to-research journey.

Verification evidence: focused after-commit binding, policy, replay and service
invocation checks passed. TC-AGENCY-002 on 2026-09-19 drove fresh signup, native
payment retry/capture and the same paid case into the real teammate research
workflow. Research consumed its saved private source before a later 3.4 fixture
source-ID mismatch. The bootstrap is proved; complete research, 3.7 QA and the
full demo are not. No live-model claim or completion of the excluded AC2 contract.
