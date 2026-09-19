# Demo tail: one line per research step / agent call of a case, as the app persists them.
# Reads the local Postgres (docker mercato-postgres) every 2 s; prints nothing twice.
#   .\bin-dev\demo-tail.ps1 -CaseId <caseId or order ref>
#   .\bin-dev\demo-tail.ps1 -Latest        # follows the newest case that has any run
param(
  [string]$CaseId = "",
  [switch]$Latest,
  [string]$Container = "mercato-postgres",
  [string]$Db = "open-mercato"
)

function Query([string]$sql) {
  $out = docker exec $Container psql -U postgres -d $Db -At -F "|" -c $sql 2>$null
  if ($null -eq $out) { return @() }
  return ,@($out | Where-Object { $_ -ne "" })
}

if ($Latest -or $CaseId -eq "") {
  $row = Query "select order_ref from agency_research_task_runs order by created_at desc limit 1"
  if ($row.Count -eq 0) { Write-Host "no runs yet"; exit 1 }
  $CaseId = $row[0]
}

$host.UI.RawUI.WindowTitle = "AI Agency - $CaseId"
Write-Host ""
Write-Host "  AI Agency on Open Mercato - live run" -ForegroundColor White
Write-Host "  case $CaseId" -ForegroundColor DarkGray
Write-Host "  step . attempt . agents . verdict . cost" -ForegroundColor DarkGray
Write-Host ""

$seenRuns = @{}
$seenAgents = @{}
$total = 0.0

while ($true) {
  $runs = Query @"
select id, step_id, attempt, status, runner, coalesce((qa_result->>'verdict'),''), coalesce((cost->>'run_total')::text,'0'), to_char(created_at at time zone 'Europe/Warsaw','HH24:MI:SS'), coalesce(jsonb_array_length(agent_run_ids),0)
  from agency_research_task_runs where order_ref = '$CaseId' order by created_at asc
"@
  foreach ($line in $runs) {
    $f = $line -split "\|"
    $id = $f[0]; $step = $f[1]; $attempt = $f[2]; $status = $f[3]; $runner = $f[4]; $verdict = $f[5]; $cost = [double]$f[6]; $at = $f[7]; $agents = $f[8]
    $key = "$id|$status"
    if ($seenRuns.ContainsKey($key)) { continue }
    $seenRuns[$key] = $true
    if ($status -eq "running") {
      Write-Host ("  {0}  {1,-5} #{2}  " -f $at, $step, $attempt) -NoNewline
      Write-Host ("started" + $(if ($runner -eq "system") { " (code)" } else { "" })) -ForegroundColor DarkGray
      continue
    }
    $color = switch ($status) { "done" { "Green" } "to_fix" { "Yellow" } "paused_budget" { "Yellow" } "failed" { "Red" } "exception" { "Red" } default { "Gray" } }
    $label = if ($verdict -ne "") { "$status ($verdict)" } else { $status }
    Write-Host ("  {0}  {1,-5} #{2}  " -f $at, $step, $attempt) -NoNewline
    Write-Host ("{0,-28}" -f $label) -ForegroundColor $color -NoNewline
    if ($runner -ne "system" -and $cost -gt 0) { Write-Host ("{0,7:N2} PLN" -f $cost) -ForegroundColor Cyan } else { Write-Host "" }
  }

  $calls = Query @"
select ar.id, ar.agent_id, ar.status, coalesce(ar.model,''), coalesce(ar.input_tokens,0), coalesce(ar.output_tokens,0), coalesce(ar.cost_minor,0), to_char(coalesce(ar.completed_at, ar.created_at) at time zone 'Europe/Warsaw','HH24:MI:SS')
  from agent_runs ar
  where ar.status <> 'running' and ar.id::text in (
    select jsonb_array_elements_text(agent_run_ids) from agency_research_task_runs where order_ref = '$CaseId')
  order by coalesce(ar.completed_at, ar.created_at) asc
"@
  foreach ($line in $calls) {
    $f = $line -split "\|"
    $id = $f[0]
    if ($seenAgents.ContainsKey($id)) { continue }
    $seenAgents[$id] = $true
    $agent = $f[1] -replace "^agency_(research|tov)\.", ""
    $status = $f[2]; $model = ($f[3] -replace "^openrouter/", "") -replace "^anthropic/", ""
    $tokens = "{0}k/{1}k" -f [math]::Round([int]$f[4] / 1000), [math]::Round([int]$f[5] / 1000)
    $usd = [double]$f[6] / 100
    $total += $usd
    $color = if ($status -eq "ok") { "DarkGreen" } else { "DarkRed" }
    Write-Host ("  {0}    agent  {1,-38} {2,-12} {3,-10}" -f $f[7], $agent, $model, $tokens) -NoNewline
    Write-Host $status -ForegroundColor $color
  }
  Start-Sleep -Seconds 2
}
