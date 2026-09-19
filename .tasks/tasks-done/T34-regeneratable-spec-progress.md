# T34 - Regenerate honest spec progress from delivery records

State: done
Sources: all `.specs/user-stories`; ADR-003 coverage map
Owns: `ai-company/scripts/agency-spec-progress.mjs` and its focused tests

## Deliver

- Read canonical story files, task states/source anchors, and ADR links without dependencies or model calls; print a concise report or JSON on demand.
- Separate story mapping, task completion, and explicitly recorded full-story verification. A completed scaffold or bounded task never completes every referenced story.
- Show domain totals, linked remaining tasks, proposal scope, and missing/invalid references. Missing acceptance evidence means unassessed, not proven absent or complete.
- Roll up actual spec taxonomy into domain/epic, feature ID and substory ID; allow
  focused feature/story inspection with linked task states and exact evidence.
  Keep partial/scaffold task delivery distinct from verified story completion.
- Support optional `Verified stories: Fxx-y` task metadata for explicit full-story acceptance; retain task/evidence references so claims can be inspected. Do not infer acceptance from prose or ADR status.
- No generated Markdown by default, no spec rewriting, no task-status auto-mutation, and no new reporting service.

## Done when

One Windows-compatible Node command regenerates the report from current records; focused parser checks cover bounded done tasks, exact IDs/family anchors, overlapping tasks and missing verification. Report percentages describe their denominator and are not estimates of effort or demo readiness.

Run `node ai-company/scripts/agency-spec-progress.mjs` from `App`; use `--details`,
`--feature F42`, or `--story F42-2` for hierarchy and `--json` for source references.
Nine focused checks pass. Story acceptance remains unassessed until explicitly
recorded; remote branches are not counted before integration. Actual taxonomy is
source category/domain → feature → substory; no synthetic epics are invented.
