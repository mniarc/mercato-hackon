# T31 - Execute a consent-bound publication with real provider evidence

State: blocked
Depends on: T29, T24; confirm publication proposal and selected provider contract
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
- Blocker: approved publication policy/provider and T29's exact consent-bearing
  instruction are not available. Do not fan out a guessed publishing implementation.
