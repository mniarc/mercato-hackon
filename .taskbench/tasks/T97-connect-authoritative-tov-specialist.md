# T97 - Connect the authoritative tone-of-voice specialist

State: active (P0; staff intake source implemented, joined strategy proof pending)
Depends on: T12, T17, TOV-02; downstream strategy bridge coordinated with `employee_process_delivery`
Owns: staff ToV intake under `agency_operations/lib/tovIntake/**`, `api/tov-intakes/**`, its focused tests and the minimal existing ToV activity/DI seams
Sources: F22-1, F23-1, F51-1, F53-1, F55-1; user decision that `agency_tov` is the sole ToV producer

Add an authorized staff action that binds a normalized public-post corpus to an
existing paid agency case and starts the existing
`agency_operations.tov-research.v1` workflow. Preserve the staff actor, exact
tenant/organization/customer/case scope, private corpus attachment, idempotent
event, workflow status and saved research/document/agent-run references. Never
impersonate a customer, replace the paid case's original material/workflow, scrape
sources, call a provider during development, or claim completion before the
native result exists.

`agency_tov` is the only ToV producer. The canonical strategy continuation must
consume its exact saved KLI-TOV version; `agency_research.tov_writer` must not
generate or rewrite a competing document. This task supplies the intake and
result-reference contract only. The strategy handoff and native joined proof are
separate coordinated delivery; T12's live-proof remainder stays open.

Implemented source now provides a staff-only paid-case-bound POST/status API,
private hash-pinned corpus attachment, one deterministic specialist workflow per
case, exact saved result references, a scoped `SpecialistTovReference` resolver,
and a persistent workflow-completion subscriber boundary. The strategy wait/
resume handler owns the other side of that boundary and must recheck on wait entry
to cover completion-before-wait. No provider, scraper or runtime proof was run.
