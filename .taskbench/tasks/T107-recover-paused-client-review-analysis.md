# T107 — Recover analysis paused on client review

State: implemented; focused checks passed, native recovery proof pending
Sources: teammate `resume-analysis --from` regression; F50-1 AC2–5, F49-1 AC4
Owns: `agency_operations/lib/analysisProcess/restart.ts` and focused tests.

Resolve the exact saved brief invitation on its separate native review workflow,
not a task incorrectly assumed to belong to the analysis workflow. Explicit staff
recovery may supersede only its still-pending scoped invitation, preserving saved
history, original workflow/policy, permitted return point and customer approval.
Running producer or client-response work and already answered reviews remain
blocked. Do not restart the order or introduce a competing ToV producer.

Done when focused regression checks cover the real two-workflow handoff and
answered/mismatched invitation guards; report native execution proof separately.

Proof: restart suite passes 11 tests, including the separate saved invitation,
answered/mismatched/stale/accepted guards and existing pinned-policy/running-work
checks. No provider calls or persistent runtime changes were made.
