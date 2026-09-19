---
id: AC3
story: F37-3
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC3

## Criterion

OM umożliwia przejście z realizacji do faktycznej wiadomości; sam wysłany request, timeout lub stan procesu nie zastępuje dowodu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — No real provider artifact is available.

## Missing

- Expose navigation to verified external publication from the case.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
