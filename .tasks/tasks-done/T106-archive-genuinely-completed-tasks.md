# T106 - Archive genuinely completed tasks without hiding unfinished proof

State: done
Outcome: RES-03 and T45 archived from their recorded bounded completion evidence;
24 eligible unfinished tasks retained. No source, runtime, spec or coverage edits.
Priority: immediate detached cleanup
Owns: `.tasks/*.md` and `.tasks/tasks-done/`, excluding T93-T106 and TOV-02.
Sources: explicit user request for a bounded PowerShell sol/high task triage.

## Deliver

- Read applicable repository instructions. Triage existing active task records;
  start with explicit done states and check their completion evidence in recorded
  handoffs, source or Git history. Do not conduct a new full-spec/code audit.
- Move only genuinely complete bounded tasks to `.tasks/tasks-done/`, preserving
  ID/name/content and fixing relative links where needed. A task may be complete
  without live model proof only when its original scope does not require it.
- Correct clearly stale task states from concrete evidence; leave ambiguous,
  partial, blocked or missing-runtime-proof tasks open. Existing T93-T106 and
  TOV-02 belong to active owners: read-only, never move/edit them.
- Return a concise moved/retained summary in the conversation, not another MD.

## Boundaries

This worker edits only task records; all application code, deployment guides,
specs, ADRs, coverage assessments/generated reports and runtime are read-only.
No tests, builds, generators, installs, servers, browsers, database commands,
provider calls, subagents, Git staging/commit/push or remote mutations. Do not
create per-task ADRs or mark stories verified merely because a task is archived.
For moves use native PowerShell `Move-Item -LiteralPath` after checking resolved
source/destination stay inside this checkout's `.tasks/` directory; never overwrite.

## Done when

Only evidenced completed tasks have moved; useful unfinished work remains visible.
Coordinator reviews the handoff once and regenerates coverage separately.
