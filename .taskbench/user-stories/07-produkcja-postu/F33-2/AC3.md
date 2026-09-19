---
id: AC3
story: F33-2
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Przekazanie otwiera obsługę publikacji, lecz nie uprawnia adaptera do wysłania tekstu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/publicationPreparation/prepare.ts` — Preparation never sends and exposes sendAllowed=false.

## Missing

- No activated real 8.1 publication handling yet; proposed external process remains unapproved.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
