# TOV-02 - Verify persisted research and protect client content

State: active
Depends on: TOV-01
Owns: teammate `agency_tov` corpus/document storage
Sources: F22-1, F53-1, F55-1; teammate persisted-research contract

Corpus, research-run and immutable document-version storage, native migration and
CLI persistence are implemented and integrated. The migration has been applied
to the persistent development database. Case linkage now uses returned exact
research/version IDs through the native workflow; no new case_ref or duplicate
TOV-03 bridge is required merely because the old handoff proposed one.

## Remaining

- Confirm real import replay and persisted version/citation reads using existing
  stored/cached research where available; coordinate with T12's live proof rather
  than launch another paid research run.
- Teammate document bodies/rendered Markdown lack an encryption map. Address
  before treating this storage as a sink for confidential client material;
  public-post corpus proof does not establish that boundary.

Done when persistence/replay and required content protection have actual evidence.
T17 supplies the scoped client artifact read seam; broad new ToV admin pages are
not a dependency of the agency slice.
