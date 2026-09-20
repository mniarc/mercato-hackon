# Full restart of the app dev runner so a changed .env actually reaches Next and the workers
# (the runner passes its own process environment to every child it respawns).
#   .\bin-dev\dev-restart.ps1
$env:PATH = "$env:LOCALAPPDATA\corepack-shims;$env:PATH"
$app = 'C:\Users\marci\projects\hackon-2026\mercato-hackon\ai-company\apps\mercato'

function Kill-Tree([int]$id) {
  Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $id } | ForEach-Object { Kill-Tree $_.ProcessId }
  Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
}
$runners = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*scripts/dev.mjs*' -and $_.CommandLine -notlike '*apps\mercato\scripts\dev.mjs*' }
foreach ($runner in $runners) { "stopping runner $($runner.ProcessId)"; Kill-Tree $runner.ProcessId }
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*next dev*' -or $_.CommandLine -like '*queue worker*' -or $_.CommandLine -like '*mercato server dev*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep 3
Set-Location $app
$proc = Start-Process powershell -PassThru -WindowStyle Minimized -ArgumentList @('-NoExit', '-NoProfile', '-Command', "`$env:PATH = `"$env:LOCALAPPDATA\corepack-shims;`$env:PATH`"; Set-Location '$app'; yarn dev --app-only")
"started runner shell pid $($proc.Id) at $((Get-Date).ToString('HH:mm:ss'))"
