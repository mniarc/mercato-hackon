---
id: AC5
story: F44-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC5

## Criterion

Przyjęcie pliku nie uznaje automatycznie jego twierdzeń za prawdziwe ani nie zatwierdza rezultatu agencji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/clientSubmissionService.ts` — Attachment intake creates a submission, not factual verification or document acceptance.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
