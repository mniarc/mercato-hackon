---
id: AC1
story: F09-2
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC1

## Criterion

Aktualizacja korzysta z poprzedniego KLI-BRIEF i dyspozycji 4.4, a gdy potrzebne były nowe dowody, także z wyniku 4.5 i odświeżonego pakietu 3.8.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/briefRevision/run.ts` — Approved server revision binds source/current brief and reuses previous brief; focused T27 checks passed.

## Missing

- Connect requested new-evidence4.5 path (T26); invited-answer revision is now proved by T58.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | not_run |
| Live Model | not_run |
