---
id: AC1
story: F32-3
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC1

## Criterion

Odrębny rekord publikacyjny powstaje tylko dla jednoznacznej decyzji obejmującej dokładną wersję i konkretny cel z konfiguracji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — publicationConsentCheck explicitly has no consent register and always returns missing.

## Missing

- Implement exact configured-target + content-version consent producer and G/source binding.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
