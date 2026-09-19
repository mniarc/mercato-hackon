# T73 - Capture customer and agency employee viewpoints

State: done
Source: user request for screenshots grouped by actor, including agency employee.
Owns: `ai-company/scripts/agency-capture-pages.ts`; images remain in ignored `.visuals/`.

## Deliver

- Future capture runs group PNGs under `customer/` and `employee/`, with actor,
  requested/actual URL and permission/unavailable-page gaps in the manifest.
- Capture native employee inbox, agency cases and genuine available case detail,
  plus teammate research list/detail when the employee identity can access them.
- Keep `admin@acme.com` as the demo employee; no substituted superadmin captures,
  permission changes or invented documents/tasks. Only own temporary customer
  fixtures are provisioned and cleaned up.
- Preserve earlier runs unchanged and retain the latest five top-level capture
  directories using the existing validated retention mechanism.

## Done when

- Actual PNGs and honest gaps are handed off by viewpoint without image review,
  full journey, paid calls, runtime restart or database reset.

Verified run: `.visuals/capture-2026-09-19T12-29-20-605Z/` contains nine nonempty
PNGs (six customer, three employee). Manifest records absent case/task records
and the employee research access gap; no fabricated detail screens. Temporary
fixtures were removed, prior captures unchanged, scoped lint passed. Capture
coverage includes signup and discovers authorized case/task/research details.
