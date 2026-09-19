# T67 - Capture current customer and employee pages

State: done (bounded capture delivered: six current-page PNGs; case-detail navigation timeout and unavailable genuine review-task screenshots reported)
Source: explicit user request for screenshots before separate visual review
Owns: capture-only tooling and ignored `.visuals/` output

Capture real running pages in a headed browser at one desktop viewport. Save
customer and employee files separately; do not inspect images or edit UI/copy.
Use existing accounts or one explicitly authorized capture-only native customer
fixture, then clean up only that fixture. No fabricated documents or review tasks,
full test rerun, provider calls, database reset or server restart.

Done when available pages are captured with their URLs and missing review states
reported honestly. The images are for the user's later review, not test proof.

Reusable capture tooling retains the latest five matching capture directories only
after a nonempty PNG was saved. It preserves the current run and unrelated paths,
checks resolved deletion targets, and never prunes after a failed capture run.

From `App/ai-company` in PowerShell, against the already running local app:

```powershell
$env:BASE_URL = 'http://localhost:5002'
$env:AGENCY_CAPTURE_CREATE_CUSTOMER = '1'
yarn tsx scripts/agency-capture-pages.ts
```

Output is always `App/.visuals`, independent of the caller's working directory.
Tenant comes from authenticated fixture credentials; an optional
`AGENCY_CAPTURE_TENANT_ID` must match that scope. Set `AGENCY_CAPTURE_ORG_SLUG`
when the local organization uses a slug other than `acme-corp`.
