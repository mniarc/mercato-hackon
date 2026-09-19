---
id: AC2
story: F41-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Zapis decyzji wskazuje osobę, czas, źródło decyzji, ID dokumentu i jego wersję.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/briefAcceptance/accept.ts` — Acceptance record stores person, server time, exact document version and original native submission source.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
