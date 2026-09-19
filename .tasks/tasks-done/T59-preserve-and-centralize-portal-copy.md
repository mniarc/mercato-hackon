# T59 - Centralize portal copy without rewriting teammate wording

State: done (bounded teammate-copy extraction)
Evidence: Exact Polish extraction was verified against teammate wording; the integrated headed TC-AGENCY-003 purchase journey and full app typecheck passed on 2026-09-19. Approved demo purchase wording remains distinct. This does not establish production payments, paid fulfilment or complete sales-story coverage.
Depends on: current T25 purchase integration
Owns: agency offer/order pages and their existing EN/PL locale keys;
coordinate purchase components with T25, no other portal redesign
Sources: F01-1, F02-1, F02-2; teammate frontend2 copy contract

## Deliver

Move existing offer/order Polish text into module translation keys verbatim,
reusing keys where meanings match. Preserve punctuation, wording, interpolated
values and visible behavior; do not normalize or improve marketing copy.
Keep approved demo-only amount/terms/status wording explicit and separate from
the teammate's package description. Preserve original navigation and subtitle.

## Done when

The Polish rendering retains the teammate copy except identified T25 functional
changes. A focused comparison against the teammate baseline and valid locale JSON
is sufficient; no new browser suite or broad translation rewrite. This task alone
does not verify the linked sales stories.
