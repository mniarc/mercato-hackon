# Milestone and branch integration

Integration is delivery work. Finish a coherent slice, integrate it, and review
the affected seams once. Do not create foraging tasks or review reports for it.

1. Inspect the worktree and stage/commit each authorized, coherent feature as soon
   as it provides usable value and its affected seam is verified; do not wait for
   unrelated backlog work. File count or an agent finishing alone is not a milestone.
   The integration owner commits explicit paths, preserving unrelated/unfinished work.
   Keep task Markdown out of staging unless requested; pushing is separate.
2. Fetch and identify the teammate branch tip. Merge ongoing branches with
   ancestry preserved; cherry-pick only an explicitly finished one-off handoff.
3. The coordinator resolves shared/generated files and cross-module wiring via
   public contracts. Keep unrelated cleanup separate.
4. Run focused combined checks and exercise affected runtime seams against the
   persistent development environment; follow [testing.md](testing.md). A merge
   does not require a fresh database or production build.
5. Report what works, remaining seams, and actual validation. Push when requested
   or agreed.

Review handoffs once, with distinct scopes only where parallel review can find a
real blocker. Block for a broken requested path, actual tenant/auth/data-integrity
defect, mocked required integration, or unusable team contract. Defer polish and
hypothetical hardening. After a fix, rerun affected checks only.

An integrated ongoing branch tip must be an ancestor of `main`, so future merges
bring only subsequent work. The teammate may merge or rebase current `main` into
their branch; never rewrite or force-push it for them. If ongoing work was
cherry-picked, merge the verified original branch tip and resolve any unexpected
tree differences before pushing; do not fake ancestry with an `ours` merge.

Use direct agents with disjoint ownership and let them complete bounded tasks
without constant polling or step-by-step rereview. The coordinator owns shared
runtime validation. Let useful parallel work finish unless it conflicts or is unsafe.

## Teammate branches

- During active delivery, the Git owner fetches and compares `origin/main` and
  the known teammate branches about every 30 minutes, and after a teammate
  handoff. Keep the last check time in conversation state, not a new tracking
  document. Integrate new work at the next safe coherent boundary; the cadence
  never justifies overwriting dirty work or interrupting a running demo.
- Treat teammate-owned implementations as authoritative over our overlapping
  mocks/scaffolds. Remove the overlap and adapt our callers. Change teammate
  behavior only for a demonstrated architectural/integration need, preserving
  their feature intent; do not rewrite it for stylistic preference or old tests.

- Use one named Git owner: the coordinator, or an explicitly delegated direct
  agent. Other agents keep to disjoint code paths and do not stage/commit/merge
  concurrently. Detached PowerShell workers do not own active integration.
- A request to check branches permits fetch/comparison, not a merge. For an
  authorized merge, verify actual ref names and exact tips. This repo uses
  `main`; do not invent `master` or assume similarly named branches are the same.
  Sync `origin/main` first, then the agreed feature branches in dependency order;
  newly discovered branches are not automatically in scope.
- Compare incoming paths with tracked, untracked, and staged local changes.
  Merge disjoint work normally. Never hide unfinished work with an automatic
  stash/reset or sweep it into a merge commit. Coordinate overlapping ownership
  before resolving it; do not use blanket `ours`/`theirs` resolutions.
- Teammate-owned implementations replace overlapping local mocks/scaffolds.
  Preserve their behavior and connect our adapters through public contracts;
  do not restore placeholders merely to satisfy old tests. Check actual callers
  and the canonical demo use the integrated surface. A UI merge alone does not
  complete missing backend/process behavior or full story acceptance.
- Prove both Git ancestry and the changed integration seam. Run focused checks
  once; generation/migration only when incoming registrations/schema require it.
  Coordinate shared runtime use before restarts or browser/database runs; merging
  is not permission to disrupt another session. Record pending runtime proof plainly.
- Report merged tips, resulting commits, and any remaining handoff. Refresh the
  existing task/ADR only when ownership or a durable decision changed. Do not
  recreate teammate capabilities locally. Push or delete branches only when asked.
