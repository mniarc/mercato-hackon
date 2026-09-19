# Vertical-slice task contract

Use [looping.md](looping.md) for delivery and [ai-company-domain.md](ai-company-domain.md)
for entities and ownership. Story/spec files provide product context; choose the
next small outcome from working-software evidence instead of planning every slice.

Register a genuine replayable task before delegating independent work:

```md
# TNN - <verb + observable outcome>

State: ready
Depends on: none | TNN
Owns: `exact/path/**`
Sources: <exact child story IDs, e.g. F40-1; name teammate contracts separately>
Context: <brief purpose and relevant existing contracts>

## Deliver
- <concrete result>

## Done when
- <observable behavior and focused verification>

## Constraints
- <task-specific constraints only>
```

States are `ready`, `active`, `done`, or `blocked`. Report changed files, checks,
assumptions, and blockers in the conversation. Do not create intermediary handoff
files or repeat general process rules in each task. Keep task/spec Markdown out
of workflow cleanup; change its content only when that task/spec is in scope.

Keep unfinished tasks in `.tasks/`; move already-done tasks to `.tasks/tasks-done/`
with the same ID, filename and content, rebasing relative links as needed. The
progress report includes both locations; archiving does not change completion claims.

For a done task that proves every acceptance criterion of a story, add
`Verified stories: FNN-N` and `Verification evidence: <test Markdown link or
commit hash; concise observed result>`. Otherwise leave story verification
unassessed. Exact child IDs feed the progress tool; broad ranges are not expanded.
