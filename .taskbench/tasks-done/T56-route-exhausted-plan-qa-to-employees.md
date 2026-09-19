# T56 - Bring exhausted plan QA to the employee exception flow

State: done (bounded handoff; full planning runtime journey not claimed)
Sources: F27-1 (AC4), F48-1, F49-2
Owns: planningExecution producer/contract; researchException planning adapter;
coordinator owns native G graph and DI.

## Deliver

After the existing plan repair loop exhausts its configured attempts, persist
an exception through the teammate's existing openEscalation producer. Link exact
plan and QA references and block dependent review (6.4). Reuse the common native
employee task and version-bound client question surface instead of ending silently.

Only keep_blocked is actionable. The documented repair point is 6.2; this task
does not authorize or implement retries, budget changes, limit acceptance or
client approval. Preserve successful planning and historical outcomes.

## Done when

Focused producer and handoff checks prove saved evidence and native routing;
publish the updated native definition through its supported API. Reuse the
existing employee UI; do not add another inbox or a duplicate full demo journey.

Evidence: `d67fdef69`; 18 producer/handoff/native-graph checks passed. Native G
definition v10 was published through the API and its saved graph matched source.
The common employee/question UI already passed the canonical post journey;
this planning-specific route has not been exercised end-to-end.
