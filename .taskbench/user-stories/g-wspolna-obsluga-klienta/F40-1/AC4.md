---
id: AC4
story: F40-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Materiał można przyjąć także po zakończeniu etapu, którego dotyczy; samo przyjęcie nie jest akceptacją rezultatu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/clientSubmissionService.ts` — Submission intake has no completed-stage exclusion; receipt does not apply approval.
- `ai-company/apps/mercato/src/modules/agency_operations/lib/materialRevision/source.ts` — Late material is accepted against the current unapproved brief; downstream or approved work becomes an explicit impact-review hold and receipt itself is not approval.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | unknown |
| Live Model | not_run |
