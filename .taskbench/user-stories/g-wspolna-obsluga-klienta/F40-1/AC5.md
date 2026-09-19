---
id: AC5
story: F40-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC5

## Criterion

Kontrakt przyjęcia jest niezależny od późniejszego wyboru maila albo panelu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/contracts/clientSubmission.ts` — One typed intake boundary exists, but current external channel is explicitly portal.

## Missing

- Channel-neutral transport mapping beyond the selected portal is not implemented; no claim of email support.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
