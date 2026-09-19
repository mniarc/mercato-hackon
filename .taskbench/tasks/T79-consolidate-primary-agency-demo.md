# T79 — One primary connected agency demo

State: active (connected customer/employee capture implemented; current full journey pending headed rerun)
Source: user request to consolidate the real application journey; existing T69,
T74–T76 and settled plan/post approval/publication-preparation behavior.
Owns: TC-AGENCY-002 and `__integration__/support/productionJourney/**`.

Reuse native signup/email verification, onboarding and successful payment, then follow
the same paid case through private upload, teammate research, original client
answers, brief and strategy/ToV acceptance, plan/topic choice, generated post,
exact content acceptance, real staff destination configuration and refreshed
publication preparation with `canSend:false`. Access remains unverified and
publication consent is never inferred from content approval.
Substitute only source/intelligence boundaries, never produced documents,
approvals or successful producer outcomes. Observe genuine failures; do not force
exceptions or bypass gates to finish the journey. No deliberately failed payment
or defective author response in the primary demo; real QA still applies.

Extend incrementally while preserving the current runnable TC002. Retire
overlapping TC001/TC003 coverage only after the combined native journey proves
their unique outcomes. TC001 now retains employee/clarification/QA recovery;
TC003 retains payment retry/replay, rendered terms and waiting-for-configuration
behavior without duplicate signup or research.
Coordinator owns runtime and checks. No paid calls or publication.

The primary journey now opens the same paid case in an isolated native staff
session with an organization-scoped read role, including research-document access.
Capture specialist readiness and final preparation on that real employee page,
not the customer's stale page. TC001–003 use the shared role-grouped `.visuals`
capture helper and finalize partial runs; only blank/filled login screenshots
were removed. No alternative behavior was retired without a passing combined run.

Historical native proof: headed TC002 passed through saved publication preparation on
2026-09-19 (7.7 minutes), using real signup, payment recovery, uploads, teammate
producers and client decisions. Only intelligence/source responses were fixtures;
sending remained disabled. Screenshots and results are in `.ai/qa/test-results/`
under `ai-company`. This does not prove live model quality, Discord delivery or
the separate late-material revision path.
