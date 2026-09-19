# T86 - Return targeted post evidence to the requesting QA

State: active
Sources: F31-2 AC1-5; T29
Owns: research `lib/postEvidence/**`, additive post-editor contract/prompt and QA continuation; coordinated public service and native caller wiring.

## Deliver

- Persist an explicit editor request identifying its missing claim, selected existing source references, P3 target, exact post/instruction/QA task and return 7.3.
- With an explicit configured cap, reuse the source extractor and native editor; return evidence to that QA without rerunning research foundations or changing approved documents.
- Keep unresolved evidence non-passing. Actual text changes use 7.2 and fresh QA; foundation contradictions remain held through existing exception/customer-question boundaries, never silent invalidation or approval.

## Boundary and proof

Initial delivery targets AC1-2 using already stored scoped source content (including private evidence), not unrestricted network discovery. AC3-5 are not complete merely because a held outcome exists; record any remaining executable recovery explicitly.
Reuse `runSourcesStep`, `runPostQaLoop`, native scoped task/document persistence and the existing orchestrator runner. No replacement agent, implicit spend, fabricated customer decision, publication or new UI.
Focused checks: exact request/source/version binding, unchanged foundations on evidence-only return, missing evidence cannot pass, and replay/no repeat spend. Native-app/live-model proof remains separate.

## Implemented scope

`runPostEvidence` loads the exact saved 7.3 request and scoped stored sources, reuses 3.2 extraction and the existing native editor, retains original QA history/cost, and resumes the same QA identity. Existing post execution invokes it only with pinned `postEvidence.maxCostPln`; absence is an explicit staff configuration hold. Evidence-only output creates only the existing immutable post QA snapshot, not new foundation documents or approvals.
Content correction uses existing 7.2/fresh QA. Unresolved evidence or an approved-foundation contradiction uses existing E with exact evidence and no automatic resolution. Full AC4 dependent-impact/reapproval execution and fresh-source discovery are not delivered; T29 remains open.

Coordinator verification: source/QA/native-caller suites passed in the combined
four-suite, 39-test check; app TypeScript passed after the independent T92 fix.
Joined native demo and live model proof remain unperformed for this branch.
