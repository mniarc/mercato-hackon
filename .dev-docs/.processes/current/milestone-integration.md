# Milestone and branch integration

Integration is delivery work. Finish a coherent slice, integrate it, and review
the affected seams once. Do not create foraging tasks or review reports for it.

1. Inspect the worktree and commit the owned slice when authorized, preserving
   unrelated work. Keep task Markdown out of staging unless requested.
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
