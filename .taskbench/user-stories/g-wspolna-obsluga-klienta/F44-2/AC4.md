---
id: AC4
story: F44-2
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Materiał zmieniający założenia wskazuje dotknięte wersje i blokuje wyłącznie zależne wykonanie do ich przeglądu.

## Evidence

- `.tasks/T30-shared-scope-impact-and-routing.md` — T64 exposes dependencies read-only; no mutation authority is inferred.

## Missing

- Material-driven affected-version review flags and selective execution holds are missing.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
