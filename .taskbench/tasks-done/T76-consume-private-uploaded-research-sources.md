# T76 - Consume private uploaded material in initial research

State: done
Sources: F06-2 AC2-4; F06-3 AC1,3,4; approved client-material ingestion scope
Depends on: T74 case-bound supplemental uploads; T75 paid-case research bootstrap
Owns: native AttachmentService extracted-text result; agency_operations analysisProcess/materialSources; agency_research source-input contract and existing source producer

## Deliver

- Resolve saved case/submission attachment references through native scoped owner,
  assignment and private-partition checks; consume native stored extraction only.
- Pass an optional trusted materialSources snapshot into the existing research
  producer, preserving attachment/submission references and client-private
  visibility, including proof cards combining public and private evidence.
- Record unavailable extraction honestly; reuse existing text limits, source
  persistence, grounding and agents. No new parser, paid OCR or prompt framework.
- Preserve URL-only callers and the original purchase attachment. This initial
  research connection does not implement later G-driven source refresh.

## Done when

Focused checks prove scoped adapter selection, actual text reaching the existing
source input, unavailable extraction and private mixed-evidence handling; the
coordinator records the native connected proof separately from model execution.

Verification evidence: focused native extraction, scoped source selection,
unavailable text and mixed-private-evidence checks passed. TC-AGENCY-002 on
2026-09-19 verified the uploaded attachment's actual text in the saved research
source with `source_visibility: client_private`, without replacing the purchase
attachment. Later competitor extraction 3.4 failed on a fixture source-ID mismatch;
this does not establish full research/3.7 QA, a completed demo or live-model proof.
