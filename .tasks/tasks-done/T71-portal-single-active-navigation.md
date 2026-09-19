# T71 - Select only the current portal navigation item

State: done (six focused tests, scoped UI build and headed materials-page check passed)
Source: user screenshot `D:/Flow-OpenMercato/image.png`, materials page highlights both Oferta and Materials.
Owns: existing `packages/ui/src/portal/__tests__/PortalShell.test.tsx`; coordinator owns runtime/package build.

## Deliver

- Preserve teammate's existing most-specific, path-boundary navigation matching
  from `f3e735f83`; portal metadata has no exact-match option.
- Add a focused regression for offer, materials and nested detail matching.
- Refresh stale UI package output: source already fixes the overlap, but
  `packages/ui/dist/portal/PortalShell.js` still uses independent prefix matches.
  No new nav abstraction, copy/style changes, full build or database work.

## Done when

- Existing PortalShell focused tests pass and the runtime serves rebuilt UI output
  with Materials alone active on `/acme-corp/portal/agency/materials`.

Verified on the persistent app without a restart or database reset; temporary
native customer fixtures were cleaned up. No production source rewrite needed.
