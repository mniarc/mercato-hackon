# T35 - Integrate teammate branches and retain real implementations

State: done (branch integration and scaffold replacement; live activation deferred)
Sources: teammate branches on `origin`; customer portal review contract section 10
Owns: ancestry-preserving integration into local `main`; superseded agency scaffolds

Integrate authorized origin main, frontend2, ToV and research branch tips. Preserve
unrelated dirty or staged work and existing screenshot changes. Stop on overlapping
edits or conflicts requiring another domain's decision; do not stash/reset or push.

Coordinator runs only the affected frontend checks. Do not restart the shared app,
run a browser/database harness, or treat this UI merge as T22's missing backend
invitation/receipt producer.

Keep teammate implementations over overlapping scaffolds; do not use blanket ours
resolution. Research F06–F09 is the reuse target for T26, not a reason
to duplicate that domain in agency_operations.

Done when all authorized teammate tips are ancestors of main, overlapping agency
scaffolds defer to their actual implementations, and affected focused checks pass.
Do not delete remote branches or merge unrelated upstream platform branches.

Merged remote main at `4261ce485`, frontend2 at `48e002f77` and final research
F09 at `a4f5bec96`; all fetched origin tips are ancestors. Affected frontend/
research checks pass, including scaffold replacement and shared model defaults.
Research runtime activation still needs generation and its supplied migration
when the shared runtime is released; this is not a live research proof.
