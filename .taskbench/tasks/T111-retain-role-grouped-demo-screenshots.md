# T111 - Retain genuine demo screenshots by viewer role

State: active
Depends on: T79
Owns: `ai-company/scripts/agency-capture-pages.ts`, shared capture utility, integration `support/demoCapture.ts`, focused capture checks.
Sources: user request for genuine full-demo images in `.visuals`, customer/employee grouping and latest-five retention.

## Deliver
- Reuse actual Playwright checkpoint screenshots in one `.visuals/capture-*` directory per run with customer/employee subdirectories and a small manifest.
- Attach the same images to the Playwright report; record failed/incomplete runs honestly.
- Share the existing bounded latest-five retention behavior with page capture; never inspect images automatically or broaden deletion targets.

## Done when
- A coordinated demo writes real role-grouped PNGs and its result; focused checks cover safe retention.
- Export `captureDemoCheckpoint(page, info, name, viewpoint)` and `finishDemoCapture(info)` from `support/demoCapture.ts` for T79. Viewpoint is `customer` or `employee`.
- Leave TC001/TC002/TC003 and productionJourney helpers to the journey worker. No shared test/runtime execution during implementation.

The shared retention utility and checkpoint helper are wired to page capture and
TC001–003 checkpoints/teardown. Four focused retention checks and the app typecheck passed:
`node --test scripts/__tests__/visual-captures.test.mjs` from `ai-company/`.
Completion still requires the coordinated demo's genuine PNGs and manifest.
