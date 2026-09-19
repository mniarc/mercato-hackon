---
id: AC3
story: F32-1
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Jeżeli dokładne miejsce publikacji jest znane, w tej samej interakcji można zebrać odrębną dyspozycję publikacji tej wersji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/postReview/service.ts` — Post review currently captures content approval or message only.

## Missing

- Add separately scoped exact-target publication consent to the known-target interaction.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
