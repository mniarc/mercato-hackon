# Bugfixes — regression suite & branch model

This folder documents **real, reproduced bugs and regressions** found in the
codebase, and the standalone regression tests that guard against them. It is
*not* a place to implement features or specs — every entry here starts from an
observed defect, is proven with a red test, fixed, and turned green.

## The tree, its branches and its leaves

The whole effort is one tree rooted in the repository's trunk:

```
main (origin)                         ← the trunk (pień): untouched upstream
  └─ bugfixes/main                    ← the bough (konar): shared regression harness
       ├─ bugfixes/<theme-a>          ← a branch (gałąź): one coherent set of related bugs
       │    ├─ regression test + fix  ← a leaf (liść): one bug, red → green
       │    └─ regression test + fix  ← another leaf on the same branch
       └─ bugfixes/<theme-b>          ← a second branch: an unrelated set of bugs
            └─ regression test + fix  ← its own leaf
```

- **Trunk (`main`)** — the current `origin/main`. We never commit fixes directly
  here; it is the reference the whole tree grows from.
- **Bough (`bugfixes/main`)** — branches off `origin/main` and carries only the
  *shared* regression infrastructure (this doc, the standalone Jest project, its
  tsconfig, the `tests/regression/` tree). Every theme branch grows from here, so
  they all share one harness and one base.
- **Branch (`bugfixes/<theme>`)** — one per *set of related bugs* (a "zestaw").
  Grows from `bugfixes/main`. Kept focused: everything on it is about the same
  subsystem or the same class of defect, so the diff reads as one story. When the
  branch is done it is committed and pushed to `origin` on its own.
- **Leaf** — a single bug: one regression test that fails on the code as-is
  (red), the minimal fix that turns it green, and a one-page write-up in this
  folder. A branch may carry several leaves when the bugs are genuinely related;
  each leaf is still proven independently red → green.

Working **broadly** means spreading several branches across unrelated
subsystems; working **deeply** means a branch can carry multiple leaves that
chase every facet of one root problem. Both shapes live in the same tree.

## The standalone regression suite

The regression specs live under `ai-company/tests/regression/**` and run as a
**separate Jest project** from the app's own suite:

```bash
# from ai-company/
node node_modules/jest/bin/jest.js --config jest.regression.cjs
```

Why a separate project instead of the app's `jest.config.cjs`:

- **Isolation & red-before-green.** A regression spec must be runnable *on its
  own* to show it fails before the fix and passes after. The app config passes
  `ts-jest` an *inline* `tsconfig` object, which drops the project's
  `isolatedModules` and leaves `rootDir` unset — so ts-jest falls into
  whole-program mode and a single-file (or single-folder) run aborts with
  `TS5011` ("common source directory … rootDir must be explicitly set"). The
  regression project points ts-jest at a real tsconfig file
  (`tsconfig.regression.json`, which sets `rootDir`), so any subset of specs
  runs cleanly in isolation. (The app suite only ever runs *all* files at once
  on CI, where the common source directory happens to resolve, which is why it
  does not hit this locally-blocking issue.)
- **Clear intent.** These specs assert *"this exact defect does not come back"*,
  not general behavior. Keeping them out of `**/__tests__/**` keeps the two
  concerns from mixing; the app suite never picks them up and vice versa.

The project reuses the app's module resolution and the MikroORM-aware
transformer, so specs import module code with the same `@/…` and
`@open-mercato/…` paths as production code.

## Index of fixes

| Date | Branch | Leaf (bug) | Doc |
|------|--------|------------|-----|
| 2026-09-19 | `bugfixes/tov-corpus-date-normalization` | LinkedIn `postedAt.date` kept un-normalised, breaking chronological order | [2026-09-19-tov-corpus-date-normalization.md](2026-09-19-tov-corpus-date-normalization.md) |
| 2026-09-19 | `bugfixes/qa-loops` | Analysis QA verdict computed over a truncated (20-item) finding list | [2026-09-19-qa-verdict-truncation.md](2026-09-19-qa-verdict-truncation.md) |
