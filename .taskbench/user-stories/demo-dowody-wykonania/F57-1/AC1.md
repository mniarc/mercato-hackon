---
id: AC1
story: F57-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC1

## Criterion

Wybór developerów albo właścicieli agencji tworzy WE-KLIENT z treścią, osobą i zamówieniem; przycisk nie koduje gotowego wyniku kontroli zakresu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/clientSubmissionService.ts` — Original client brief response records person/case/content.

## Missing

- No demonstrated explicit demo direction choice preserving input without baked scope outcome.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
