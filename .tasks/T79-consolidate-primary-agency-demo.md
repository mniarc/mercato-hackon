# T79 — One primary connected agency demo

State: active (full primary journey proved; overlapping journey trimming remains)
Source: user request to consolidate the real application journey; existing T69,
T74–T76 and settled plan/post approval/publication-preparation behavior.
Owns: TC-AGENCY-002 and `__integration__/support/productionJourney/**`.

Reuse native signup/email verification, onboarding and payment retry, then follow
the same paid case through private upload, teammate research, original client
answers, brief and strategy/ToV acceptance, plan/topic choice, generated post,
exact content acceptance and publication preparation with `canSend:false`.
Substitute only source/intelligence boundaries, never produced documents,
approvals or successful producer outcomes. Observe genuine failures; do not force
exceptions or bypass gates to finish the journey.

Extend incrementally while preserving the current runnable TC002. Retire
overlapping TC001/TC003 coverage only after the combined native journey proves
their unique outcomes; retain a separate meaningful employee/QA failure path.
Coordinator owns runtime and checks. No paid calls or publication.

Native proof: headed TC002 passed through saved publication preparation on
2026-09-19 (7.7 minutes), using real signup, payment recovery, uploads, teammate
producers and client decisions. Only intelligence/source responses were fixtures;
sending remained disabled. Screenshots and results are in `.ai/qa/test-results/`
under `ai-company`. This does not prove live model quality, Discord delivery or
the separate late-material revision path.
