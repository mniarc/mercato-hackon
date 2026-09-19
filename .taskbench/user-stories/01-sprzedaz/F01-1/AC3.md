---
id: AC3
story: F01-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Klient widzi poprawki bez limitu rund w zakupionym zakresie i wyłączenie dodatkowych rezultatów, marek, rynków i języków.

## Evidence

- `ai-company/apps/mercato/src/modules/agency/frontend/[orgSlug]/portal/agency/page.tsx` — Translated offer renders unlimited in-scope revisions and excludes extra scope.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
