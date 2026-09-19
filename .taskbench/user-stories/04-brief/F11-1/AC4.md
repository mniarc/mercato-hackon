---
id: AC4
story: F11-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

WEW-ZRODLA i WEW-USTALENIA są aktualizowane o uzyskany wynik i powiązane dowody.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/materialRevision/run.ts` — The same order receives append-only WZR-ZRODLA and targeted WZR-USTALENIA versions with the new evidence IDs.
- `ai-company/apps/mercato/src/modules/agency_research/lib/materialRevision/__tests__/append.test.ts` — Focused checks retain prior IDs, sources, proof cards, unrelated fields and client decisions while appending private evidence.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | not_run |
| Live Model | not_run |
