# T31 - Execute a consent-bound publication with real provider evidence

State: blocked for sending; destination preparation in progress under T83
Depends on: T29, T24, T83; explicit send authorization and applicable publication policy
Owns: `agency_operations/lib/publication/**`; native workflow publication adapter
Sources: F34-1, F34-2, F35-1, F36-1, F36-2, F36-3, F36-4, F37-1, F37-2, F37-3; F46-1, F46-2, F58-1

## Deliver

- First agree the source proposal, then reuse native integrations/secret storage
  and bind target, access, exact immutable text and client consent. No LLM publisher.
- Implement deterministic preflight, atomic reservation/send-start and consent
  revocation handling. Distinguish proven success, certain failure and unknown outcome.
- Persist actual provider proof/link/time separately from confirmation time;
  unknown sends require reconciliation, not blind retry even after human instruction.

## Done when

- After approval to send, one real demo-provider publication has clickable evidence.
  Focused adapter/race tests cover duplicate send and unknown-state safety; no need
  to rerun unrelated purchase or authoring tests.

## Constraints

- F34–F37 are proposals, not settled production policy. Discord is the demo target,
  not evidence all channels work. No external send without configured authorization.
- Native `channel_discord` is registered and reusable: [adapter](../ai-company/packages/channel-discord/src/modules/channel_discord/lib/adapter.ts)
  and native integration credential storage already exist. [T83](T83-configure-exact-discord-publication-destination.md)
  prepares the scoped exact destination; sending stays disabled, and local configuration
  does not verify Discord target permissions or approve the broader F34 policy.
- Remaining send gates: explicit authorization, a configured exact target and valid
  exact-content/target consent. Before publication, reconcile the native
  [REST sender](../ai-company/packages/channel-discord/src/modules/channel_discord/lib/discord-rest.ts)
  retry behavior: POST timeouts/429/5xx can retry without idempotency, while the adapter
  reports ambiguous timeouts as failure. Do not claim exactly-once delivery or blindly
  retry an unknown outcome; do not replace the existing provider with a guessed sender.
