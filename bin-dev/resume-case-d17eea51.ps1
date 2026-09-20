# Rehearsal continuation of the live demo case: plan -> post -> publication docs -> package,
# simulated client decisions (every version flagged). Runs detached; log next to the other run logs.
$env:PATH = "$env:LOCALAPPDATA\corepack-shims;$env:PATH"
$env:OM_AGENCY_RESEARCH_LEGACY_TOV_WRITER = '1'
Set-Location 'C:\Users\marci\projects\hackon-2026\mercato-hackon\ai-company\apps\mercato'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$log = "output\research\open-mercato\run-case-d17eea51.$stamp.log"
"log: $log" | Out-File -FilePath 'output\research\open-mercato\resume-launcher.log' -Append -Encoding utf8
& yarn mercato agency_research run --order output\research\open-mercato\order.d17eea51.json --order-ref d17eea51-10c8-4437-8f5b-f350db068a32 --out output\research\open-mercato\case-d17eea51 --resume-from 6.7 --through 9.3 --simulate-client --max-cost-pln 60 --yes *> $log
"exit: $LASTEXITCODE" | Out-File -FilePath 'output\research\open-mercato\resume-launcher.log' -Append -Encoding utf8
