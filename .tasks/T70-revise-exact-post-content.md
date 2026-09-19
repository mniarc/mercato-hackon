# T70 - Revise the client's exact post and return it for review

State: active
Depends on: T49 post producer and T50 exact review; explicit revision execution authority
Owns: research producer `agency_research/lib/postRevision/**`; independent operations
bridge `agency_operations/lib/postRevision/**`, minimal G routing/prompt/contracts,
policy and DI. Coordinator owns staff projection and shared verification.
Sources: F30-2 AC4-5; F32-1 AC2; F33-1 AC1-4.

## Deliver

- Bind one trusted saved client-change directive to its exact invited current post
  and original text; replay the same submission without spending again.
- Reuse the teammate 7.2 author and 7.3 QA with the prior post and unchanged pinned
  instruction/ToV. Save a new version of the same post with fresh QA, never inherited
  content approval or publication permission; preserve previous versions/history.
- Return saved result/exception references for the existing review/employee handoff.

## Done when

- Focused producer checks show exact-input binding, replay and genuine producer/QA
  continuation. Coordinator separately wires the public service and G bridge.
- Task completion does not claim all post-change destinations or native/live proof.
- Native bridge binds the completed invitation, saved G run and verbatim response;
  only explicit `changeScope: post_content` may invoke the producer. Missing
  revision budget or upstream/unclear scope retains a saved actionable wait.

## Authority and constraints

- Existing `policy.postExecution` authorizes initial selected-topic production; its
  cap is not silently renewed for every client correction. Producer must require an
  explicit trusted cap. Integration may expose disabled-until-configured
  `policy.postRevision.maxCostPln`; no initial-production cap reuse, default budget
  value or paid-call permission. Missing configuration must preserve the saved
  response with an actionable configuration hold.
- No strategy/topic change, new result, research fetch, publication operation,
  client-configurable budget or new agent/framework. No shared files/runtime/Git.
