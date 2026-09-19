---
id: AC2
story: F37-3
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Dowód obejmuje ID wiadomości i próby, platformę i dokładne miejsce, czas publikacji wynikający z dowodu dostawcy oraz osobno czas potwierdzenia przez system, rzeczywisty link i powiązanie z zamówieniem, wersją oraz zgodą. Czas potwierdzenia nie zastępuje nieznanego czasu publikacji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — Schema separates publication/evidence fields and leaves unknown values null.

## Missing

- Populate real message/attempt/target/provider-time/system-time/link/consent from verified evidence.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
