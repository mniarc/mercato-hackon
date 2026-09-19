# T28 - Turn an accepted plan and selected topic into a post instruction

State: done
Depends on: T47, T48; T24 for later live activation
Owns: `agency_research/lib/planAcceptance/**` and `postInstructionExecution/**`; `agency_operations/lib/planReview/**`, `planApproval/**` and collocated portal review; coordinator owns G/public service/DI wiring
Sources: F26-1, F26-2, F27-1, F27-2, F27-3, F28-1, F29-1, F29-2

## Deliver

- Consume accepted exact brief/strategy/ToV versions and configured catalog topic
  count from T48's source-backed 30-day, one-channel plan and QA result.
- Reuse customer review receipts for the current plan and one existing topic;
  assemble the downstream post instruction deterministically from those records.
- Apply saved G routing without reclassification and preserve dependency links.
- Parallel boundaries: producer owns exact plan eligibility and approval/selection
  receipts; portal owns the native client task and original response; instruction
  producer reuses the teammate deterministic compiler with pinned inputs. Root
  connects saved G approval and continuations. No paid calls or new worker framework.

## Done when

- A valid current plan/topic choice yields one pinned post instruction; stale or
  foreign choices cannot. Exercise these changed boundaries with focused checks.

## Evidence and boundary

Implementation `fd1fc7e46`; connected proof `a12410a30`. The headed native demo
passed real plan QA repair, explicit nonrecommended topic selection, native G,
exact approval receipt and persisted instruction, plus employee recovery.
Only intelligence and accepted upstream foundations used fixtures; no paid call.
This completes the task's approval/selection/compiler outcome, not every linked
story: later topic-change invitations and change/hold business effects remain open.

## Constraints

- Reuse merged RES-03 `agency_research` plan/QA and deterministic post-instruction
  producers. Do not activate duplicate agency planner/QA agents or copy their compiler.
  Its simulated recommended-topic selection is not a real customer receipt;
  bind one explicit choice to the current exact plan and accepted dependencies.
- The source's count of 12 is unresolved, not a default. A plan or topic approval
  does not approve a future post or publication.
