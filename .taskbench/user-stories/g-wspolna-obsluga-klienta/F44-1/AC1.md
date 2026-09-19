---
id: AC1
story: F44-1
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC1

## Criterion

Plan wpływu wymienia dotknięte pola, dokumenty i wersje, blokady, niezmienione części oraz najwcześniejszy krok wznowienia.

## Evidence

- `.tasks/T30-shared-scope-impact-and-routing.md` — Read-only input lineage is available; it grants no mutation or return authority.

## Missing

- No persisted impact plan naming changed fields, exact affected versions, unaffected work and permitted return.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
