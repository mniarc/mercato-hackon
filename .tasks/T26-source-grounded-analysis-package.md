# T26 - Produce one versioned evidence and analysis handoff

State: active
Depends on: T24; T19 execution seam
Owns: `agency_operations/lib/analysisProcess/**`; case/workflow handoff to teammate research
Sources: F06-1, F06-2, F06-3, F07-1, F07-2, F07-3, F08-1, F08-2, F08-3, F11-1, F11-2

## Deliver

- Integrate the existing `agencyResearchService.run/status` public contract and
  native workflow activities. Bind approved tasks/templates and exact evidence
  versions; do not duplicate teammate collection, agents, gates, or document storage.
- Teammate F06–F09 through step 4.2 is merged. Use its actual source/audit/market/
  findings/brief service; findings and QA retain explicit gaps and exact versions.
- Support targeted supplementary evidence and return to the requesting brief/QA
  task with pinned outputs, rather than restarting the entire process.

## Done when

- One package links its real inputs, findings and QA result; missing evidence is
  explicit. Focused checks prove the package handoff and targeted return binding.

## Constraints

- No invented sources, implicit web permissions, copied ToV research internals,
  or claiming a definition alone can collect evidence.
- Configure execution policy through an authorized staff-owned native definition;
  uploaded material is evidence, never budget/payment/approval authority.
- Teammate step resumption now exists (`resumeFrom` in the public research run
  contract; merged by `064e3068e`). Its availability alone does not prove a
  targeted F11 evidence return to the exact requesting QA task. T78 implements
  the bounded late-material/unapproved-brief path; its joined native proof remains
  pending. Preserve pinned outputs and never restart the whole process to hide
  an unconnected return.
- The existing configured analysis intake/activity is the reuse point. T36 owns
  its missing portal caller; T37 owns employee inspection of persisted partial
  research. Neither task recreates collection or proves the targeted F11 return.
