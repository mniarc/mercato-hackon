# Refresh and read coverage

Run from `App/ai-company`:

```powershell
node scripts/agency-spec-progress.mjs --refresh
node scripts/agency-spec-progress.mjs --story F25-1
node scripts/agency-spec-progress.mjs --feature F02
```

`--refresh` scans once and writes these team-shared outputs:

- [generated/inventory.json](generated/inventory.json): machine-readable inventory.
- [generated-report.html](generated-report.html): standalone report; open locally
  in a browser, without an application server.

The story/feature commands inspect the selected scope without rewriting outputs.

## Sources and meaning

- Canonical IDs and acceptance criteria come from `App/.taskbench/user-stories/`
  (split format: each story is a subdirectory `FNN-N/` containing `story.md` and
  individual `AC*.md` files). Falls back to `App/.specs/user-stories/` (flat files)
  when `.taskbench` is absent.
- Task links/state come from `App/.taskbench/tasks/` (active) and
  `.taskbench/tasks-done/` (archived). Falls back to `App/.tasks/` when `.taskbench`
  is absent.
- Reviewed claims live in [assessments/](assessments/), one `FNN.json` per feature.
- Generator code and its focused tests live in [src/](src/); the command above is
  the stable entry point.

Each criterion records `implemented`, `partial`, `missing` or `unassessed`.
A story is implemented only when every criterion is recorded implemented;
all-missing is missing, all-unassessed is unassessed, and mixed states are partial.
An unassessed criterion is not evidence that code is missing. Proposed scope is
shown separately from settled requirements.

Focused checks, native-app/fixture proof and live-model proof are independent.
`not_run` means that proof was not run, not missing code or a failed test.
Fixture proof is not live-model proof. A done task does not complete its linked
story, and coverage counts are neither effort percentages nor demo-readiness proof.

## Update workflow

1. Read the actual criterion and its code/proof. Edit the corresponding assessment
   only when evidence warrants it: implementation, App-relative evidence paths,
   remaining behavior, external decisions and the applicable proof status.
2. Update/archive a task only when its own bounded deliverable is truly done.
3. Run `--refresh`; inspect the affected story and report for truthful remaining
   gaps. Do not edit generated HTML or inventory to change an assessment.
4. Explicitly commit changed source assessments and regenerated inventory/report
   together; include task changes when authorized. The report is shared with the
   team, not a private disposable artifact.

Regeneration is deterministic: it calls no AI, executes no tests, does not inspect
remote branches, and never assesses code or completes tasks automatically. It
reports recorded evidence from the current checkout, including uncommitted files.
