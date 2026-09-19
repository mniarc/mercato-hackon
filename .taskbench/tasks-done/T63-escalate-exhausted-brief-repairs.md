# T63 - Route exhausted brief author repairs to staff

State: done
Verification evidence: `292656115`; focused `f09.test.ts` checks distinguish
exhausted author repairs (one exact-version escalation) from ordinary client
questions, and briefRevision exception-handoff checks preserve the saved result
for the native employee route. No live exhaustion or controlled-resume claim.
Depends on: T27 connected brief revision; existing E.1 employee handoff
Sources: F09-3 AC2-5; F10-1 AC1; F48-1 AC1-4; F51-1 AC2-3
Owns: `agency_research/lib/research/steps/briefQa.ts`, focused brief QA checks;
coordinate additive outcome propagation with the producer/coordinator owner.

After the existing bounded 4.1 repair loop, a remaining `needs_agent_fix` must
save the real `qa_exhausted` escalation through `openEscalation`, with the exact
4.2 task, checked brief version, findings and affected dependent steps. Propagate
its saved reference through the existing producer outcome into the native employee
exception handoff. Preserve QA verdicts, configured repair limits and all passing
behavior. `needs_client_data` remains a client question, never this escalation.

Offer only the existing `keep_blocked` action; no invented override, approval,
budget increase or producer resume. Done when exhausted author repairs yield one
saved escalation per loop invocation and the revision caller preserves it, while
focused checks show passing QA and normal client questions do not escalate.
Controlled employee resumption remains separate unfinished F50 work.
