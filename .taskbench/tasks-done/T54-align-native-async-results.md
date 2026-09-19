# T54 - Consume Open Mercato's actual async activity results

State: done
Delivered: `672345013` commit barrier and `23bc9e681` native result readers. Focused checks, core build and the headed native-post journey passed. Existing database preserved; no delay workaround or new execution framework.
Sources: F20-1, F23-1, F30-1, F48-1; observed T52 native post handoff failure
Owns: agency_operations async result constants/readers; coordinator owns graph publication and runtime.

Native async completion stores `activityId_result`, unlike synchronous activity-name
storage. Align analysis, strategy, planning and post result consumers with that
platform contract; preserve readable existing results where needed, without a new
execution framework. Check the changed binding and reuse the canonical demo.

Separately diagnose why the completed post queue job left its workflow waiting;
capture the native resume error rather than assuming the key mismatch caused it.
No database rebuild, speculative platform rewrite or extra test journey.

Confirmed: the immediate activity starts before the enqueueing transition commits;
resume reports `Workflow instance not waiting for activities`. Reuse the existing
native `awaitStepParkingCommit` row-lock barrier (already used for INVOKE_AGENT)
before ordinary async worker execution in both worker entry points. Do not add
sleep-based retries or hold the lock while running a producer/model.
