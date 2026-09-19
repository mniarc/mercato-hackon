# T108 - Refresh and archive completed task records

State: done
Outcome: T99 and T102 archived from their recorded bounded implementation and
check evidence; newer partial and runtime-dependent tasks retained without broader
story-coverage claims. No code, runtime, spec, coverage or critical-report changes.
Priority: bounded parallel housekeeping
Source: user request to refresh tasks after integration, archiving only work already done.
Owns: `.tasks/*.md` and `.tasks/tasks-done/`, except active T93, T95, T96, T98, T105, T107 and TOV-02.

## Deliver

Check existing completion evidence and relevant source/history; correct stale task
states and move genuinely completed records to `tasks-done/`. Preserve IDs and
useful links. Leave partial work and required unproved runtime outcomes open;
source integration alone does not prove a journey or clean server installation.
Do not repeat T106's broad triage: prioritize changes since that cleanup.

All code, specs, ADRs, coverage, `.tasks-critical/` and excluded active tasks are
read-only. No tests, builds, generators, database/server/browser operations,
provider calls, Git mutations, extra workers or new reports. Never overwrite an
archive destination; validate moves remain within `.tasks/`.

Done when evidenced completed tasks are archived and a concise handoff names
what moved, what changed, and any relevant remaining gap. Do not delete critical
reports or mark story coverage complete merely because a task moved.
