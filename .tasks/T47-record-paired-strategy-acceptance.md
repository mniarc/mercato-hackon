# T47 - Record exact strategy/ToV decisions and expose planning readiness

State: active
Remaining: T58 proves the connected all-pair approval path. Focused producer
checks cover partial and linked decisions, but a partial response followed by
the actual linked native follow-up decision is not yet proved end to end.
Depends on: T27 paired original response; T41 native authorized acceptance pattern
Sources: F24-2, F25-1, F20-2; F44-1 unchanged-version history
Owns: `agency_research/lib/strategyPairAcceptance/**`, `agency_research/lib/planningReadiness/**`; coordinator owns public contracts/service and G wiring

Append approval records only for documents selected in the preserved paired
response after one authorized G decision. Keep person, time, native source,
shown pair and base brief version. Replay cannot reinterpret the selection.
Require exact current versions, clean pair QA and a current accepted brief.

Partial approval remains historical but cannot make planning ready. Linked
decisions may complete the current pair; an unchanged current document retains
its recorded approval only with the same brief and valid current-pair QA.
Expose read-only readiness with exact references and explicit missing reasons;
do not generate a plan or request another customer consent.

Done when focused producer checks and the connected G path prove partial/all
decisions, replay, stale/current-base rejection and complete-pair-only readiness.
The paired invitation needs a linked follow-up native task after a partial
response; a completed initial invitation cannot stand in for that second decision.
