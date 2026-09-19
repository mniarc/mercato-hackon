# T110 - Keep sample pages out of normal agency navigation

State: done (native navigation checks passed; no module services removed)
Depends on: none
Owns: app module registration/navigation overrides and a focused navigation check.
Sources: user report of Przykład entries in the agency workspace; native module navigation contracts.

## Deliver
- Hide example-only sidebar items through supported native navigation metadata or overrides.
- Preserve the example module's mock payment gateway, services and explicit test/demo routes.
- Preserve teammate UI and Polish copy; no layout redesign or broader module removal.

## Done when
- Normal agency navigation excludes sample entries, relevant agency links remain, and demo payment registration is retained.
- Hand off code and focused checks for coordinator execution after the implementation batch; no runtime or generators during edits.

Implementation: `agency_operations/navigation-overrides.ts` uses native `routes.pages` metadata overrides (`navHidden`) and disables the two injected sample menu shortcuts by widget ID. Loaders, authorization, APIs and mock payment services remain enabled. Verification: both focused native navigation checks passed, and the app typecheck passed on 2026-09-19. The coordinated demo separately exercises payment and agency pages.
