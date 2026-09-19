# T112 - One golden native run, journaled, and the demo evidence around it

State: queued (after T110, T111 and the unblocked T30/T31/T32; owner: whoever runs the demo rehearsal, Marcin pays)
Depends on: T93, T95, T96 (harness), `yarn mercato agency_research journal` (research lane), T110 decisions
Owns: `.dev-docs/integrations/journals/` (local), the regenerated `generated/` indexes, the coverage `liveModel` claims it justifies, the demo script and fallback recording
Sources: F56-1, F57-1, F58-1, F59-1; live-model proof for every story the run reaches

## Deliver

Live-model proof cannot be written; it has to be run. Today the journal shows
32/37 agents and 6/14 handoffs live because no client ever answered a brief
live and every acceptance after the brief was CLI-simulated. One case driven
entirely through the customer portal, with the real models, closes that:

order -> payment -> 3.x research -> brief -> client answers the questions ->
revised brief -> acceptance -> strategy + ToV pair -> pair acceptance -> plan ->
topic choice -> post -> content acceptance -> separate publication consent ->
Discord send -> receipt -> package -> delivery -> closure.

- Run it on the Flow order (or a copy) under the portal cap (40 PLN/run,
  budget ~40-60 PLN total). Do not restart the order on failure; use the
  sanctioned resume/recovery from T60 and record the wait/failure honestly.
- After each stage, export the journal (`journal --order-ref <caseId>`) and
  refresh both indexes; mark `liveModel: passed` only where the stage produced
  the criterion's behaviour and its gate validated it. Update assessments and
  generated reports in the same commit.
- Run both demo audience variants (developers / agency owners, F10-2 AC1),
  record wall-clock per stage and per document (F57-1 AC5-6, F58-1 AC6), and
  keep a labelled recording of the completed run as the fallback (F59-1).
- Keep the demo script honest: what is prepared data, what is generated live,
  where a wait for the client is normal, what is out of scope.

## Done when

- The integration index shows every connected agent and handoff observed live
  on one runId; the coverage report's live-model count matches the criteria
  that run reached; the demo script names the recording, the timings and the
  fallback switch. Anything the run did not reach stays `not_run`.
