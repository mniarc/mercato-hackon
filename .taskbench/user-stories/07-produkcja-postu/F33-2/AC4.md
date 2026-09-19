---
id: AC4
story: F33-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Instrukcja powstaje według wzorca i nie wymaga osobnej akceptacji klienta jako dokument wewnętrzny.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/publicationPreparation/prepare.ts` — Existing template builder saves internal instruction with no separate approval gate.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
