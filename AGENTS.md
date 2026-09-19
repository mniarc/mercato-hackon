# Team repository

This repository owns the application in `ai-company/`, `.tasks/`, `.specs/`, and
`.dev-docs/`. Run Git here; the parent workspace is a separate personal repository.

## Always

- Follow [the delivery loop](.dev-docs/.processes/current/looping.md); reread it
  after context compaction.
- Use [testing](.dev-docs/.processes/current/testing.md) for development/runtime
  commands and [integration](.dev-docs/.processes/current/milestone-integration.md)
  for Git and milestone review. These are the team's workflow defaults, including
  for `ai-company/`; upstream instructions remain authoritative for Open Mercato
  APIs, security, extension points, and technical contracts.
- Give Git integration one named owner. Preserve teammate implementations over
  overlapping scaffolds and follow the integration process for branch selection,
  ancestry, dirty-work preservation, and scoped proof; fetching is not merging.
- Give direct subagents disjoint paths. The coordinator owns shared/generated
  files, runtime state, and integration; review their handoff once, then rerun
  only checks affected by a real fix.
- Write Markdown only for durable tasks, processes, decisions, or requested docs.
  Update existing guidance; keep transient coordination in the conversation.
- Ground business behavior in the relevant `.specs/user-stories` IDs. Name the
  source in each task; distinguish teammate frontend/ToV contracts from product
  requirements. Flag conflicts or missing business decisions instead of inventing
  policy. Explicitly labelled partial scaffolds are not completed story coverage.
- Treat demo screenshots as human-review artifacts: report their paths and test
  checkpoint names, but do not open or visually inspect them unless the user
  explicitly requests image review.

## Never

- Do not add top-level feature/ownership overviews here; those belong in the
  outer workspace's `AGENTS.md`. This file defines team working instructions.
- Do not create README files or inventories unless requested. Do not use specs
  or task files as progress logs.
- Do not store code reviews or delivery state in information-foraging records.
  External/platform research belongs in `.dev-docs/info-foraging/agents-info-traces/`;
  synthesized findings and reusable knowledge stay in their existing directories.
