# T79 — One primary connected agency demo

State: active
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
