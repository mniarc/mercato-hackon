---
id: AC1
story: F06-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Rejestr obejmuje stronę WWW i jeden oficjalny profil społecznościowy, jeśli istnieje, w zakresie STD-OFERTA.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/fetch.ts` — Collector handles company website and supplied official social URL/corpus within configured source limits.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
