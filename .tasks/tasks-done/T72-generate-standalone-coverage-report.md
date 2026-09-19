# T72 - Generate a standalone coverage report

State: done (15 tool tests passed; standalone report generated)
Depends on: none
Owns: `ai-company/scripts/agency-spec-progress.mjs`, `ai-company/scripts/__tests__/agency-spec-progress.test.mjs`, `.gitignore`
Sources: User-requested visualization of canonical specifications and `.dev-docs/coverage/*.json`
Context: Reuse the progress tool's report model so source implementation, recorded proof, scope status, task evidence, and gaps remain distinct.

## Deliver
- Generate one accessible, self-contained offline HTML report with summary, filters, and domain-to-criterion drilldown.

## Done when
- `--html [path]` preserves existing CLI/JSON behavior, defaults to the ignored coverage report path, safely escapes content, and exposes evidence links and missing criteria without implying product-completion percentages.

Generate from `ai-company`: `node scripts/agency-spec-progress.mjs --html`.
Open `.dev-docs/coverage/report.html`; the generated report is local and gitignored.
