# T103 - Connect specialist source discovery to agency intake

State: active
Priority: P0-immediate
Depends on: T97 existing case-bound intake
Owns: `agency_operations/lib/tovDiscovery/**`, `api/tov-discovery/**`; request shared intake/DI changes from coordinator.
Sources: F22-1, F23-1, F51-1; user instruction to integrate teammate agents. Technical contract: `agency_tov.source_scout` and existing discovery CLI/service.

## Deliver

- Read the actual story and existing scout contract; reuse the teammate implementation, not a new discovery agent.
- Add an authorized, tenant/case-scoped app entry and actionable discovery result that feeds existing specialist intake where the native contract supports it.
- Preserve explicit source selection and existing supplied-corpus path; discovery does not imply client approval or permission to spend.
- Approved continuation: explicitly staff-selected targets from the saved scout
  run may pass through the existing corpus scraper into native ToV intake behind
  a disabled-by-default gate. Reuse native attachments; no paid collection/model
  calls during implementation or checks.

## Done when

The app can reach the real scout through a bounded native execution path and use
its saved result in intake, with focused scope/handoff checks. Report exact
missing business decisions rather than inventing selection or spend policy.
No paid calls; source-ready is not live proof.

## Current boundary

- Implemented: staff-authenticated, tenant/case-scoped POST and GET entry to the
  native `agency_tov.source_scout`, with exact saved-run replay and an explicit
  candidate-target result that does not claim a corpus, acceptance or ToV start.
- Focused proof: `tovDiscovery/__tests__/service.test.ts` â€” 3 tests passed.
- Remaining: an explicit staff-selected collection action must reuse the optional
  `agencyTovCorpusScraper` contract and its configured limits, then hand the
  resulting normalized posts to the existing supplied-corpus intake. This step
  is not automatic because it performs external collection and selects sources.
