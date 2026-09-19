---
id: AC5
story: F47-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC5

## Criterion

Samo zgłoszenie nie zmienia historii wcześniejszej akceptacji, dowodu publikacji ani wyniku dostawy.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/clientSubmissionService.ts` — Submission itself does not overwrite previous approval records.

## Missing

- Publication/delivery histories and their postdelivery immutability are not yet exercised by an actual delivery flow.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
