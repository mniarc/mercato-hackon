# T07 — Observable demo-test progress

State: done
Depends on: none
Owns: the retained agency Playwright spec and module-local test helpers only.

## Outcome

Make a long demo run show its current phase and last completed seam without
opening reports or guessing whether it is stuck.

## Deliver

- Use named Playwright steps and concise live progress messages for the retained
  journey: fixture ready, intake stored, workflow completed, employee signed in,
  case visible, material retrieved, and cleanup complete.
- On failure or timeout, make the last completed phase obvious in terminal
  output and the normal Playwright report.

## Constraints

- Do not add another test path, reporter framework, production logging, or
  per-poll output.
- Do not print secrets, material content, session values, or unnecessary IDs.
- Keep the same progress behavior for headed/headless runs, independently of
  whether the app uses persistent or explicitly disposable infrastructure.

## Done when

- A developer can locate a slow or failed demo phase from live terminal output.
- Logging remains bounded to meaningful phase transitions and does not increase
  the behavior asserted by the test.

## Evidence

`d140a7054` added `runDemoPhase`: named Playwright steps and bounded start/complete
messages for the seven phases above. The current headed failure was localized
to employee sign-in after workflow completion. Final scenario success belongs
to T04; it is not required to prove that failure progress is observable.
