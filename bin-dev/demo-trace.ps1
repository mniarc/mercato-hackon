# Demo trace: everything the app persists while someone clicks through it, one line per event.
# Cases, workflows (start / pause / resume / status), user tasks (created / completed), client
# submissions, document versions, research steps and every agent call with model, tokens and cost.
# Polls the local Postgres (docker mercato-postgres) every 2 s from the moment it starts.
#   .\bin-dev\demo-trace.ps1            # from now on
#   .\bin-dev\demo-trace.ps1 -Since 30  # include the last 30 minutes
param(
  [int]$Since = 0,
  [int]$Iterations = 0,
  [string]$Container = "mercato-postgres",
  [string]$Db = "open-mercato"
)

function Query([string]$sql) {
  $out = docker exec $Container psql -U postgres -d $Db -At -F "|" -c $sql 2>$null
  if ($null -eq $out) { return @() }
  return ,@($out | Where-Object { $_ -ne "" })
}
function Line([string]$at, [string]$kind, [string]$text, [string]$color = "Gray", [string]$tail = "", [string]$tailColor = "Cyan") {
  Write-Host ("  {0}  " -f $at) -NoNewline -ForegroundColor DarkGray
  Write-Host ("{0,-10}" -f $kind) -NoNewline -ForegroundColor $color
  Write-Host $text -NoNewline
  if ($tail -ne "") { Write-Host ("  " + $tail) -ForegroundColor $tailColor } else { Write-Host "" }
}
function Short([string]$id) { if ($id.Length -gt 8) { return $id.Substring(0, 8) } else { return $id } }

$startRow = Query "select to_char(now() - interval '$Since minutes', 'YYYY-MM-DD HH24:MI:SS.US')"
$start = $startRow[0]
$host.UI.RawUI.WindowTitle = "AI Agency on Open Mercato - trace"
Write-Host ""
Write-Host "  AI Agency on Open Mercato - what the app persists, live" -ForegroundColor White
Write-Host "  time  kind  event" -ForegroundColor DarkGray
Write-Host ""

$seen = @{}
function Once([string]$key) { if ($script:seen.ContainsKey($key)) { return $false }; $script:seen[$key] = $true; return $true }

$iteration = 0
while ($true) {
  $iteration += 1
  if ($Iterations -gt 0 -and $iteration -gt $Iterations) { break }
  foreach ($l in (Query "select id, title, to_char(created_at at time zone 'Europe/Warsaw','HH24:MI:SS') from agency_cases where created_at >= '$start' and deleted_at is null order by created_at")) {
    $f = $l -split "\|"; if (Once "case|$($f[0])") { Line $f[2] "case" ("new case " + (Short $f[0]) + "  " + $f[1]) "White" }
  }
  foreach ($l in (Query "select id, workflow_id, status, coalesce(current_step_id,''), to_char(greatest(updated_at, created_at) at time zone 'Europe/Warsaw','HH24:MI:SS'), coalesce(error_message,'') from workflow_instances where greatest(updated_at, created_at) >= '$start' and deleted_at is null order by greatest(updated_at, created_at)")) {
    $f = $l -split "\|"; if (Once "wf|$($f[0])|$($f[2])|$($f[3])") {
      $c = switch ($f[2]) { "RUNNING" { "Green" } "PAUSED" { "Yellow" } "COMPLETED" { "Green" } "FAILED" { "Red" } "CANCELLED" { "DarkGray" } default { "Gray" } }
      $wf = $f[1] -replace "^agency_operations\.", ""
      Line $f[4] "workflow" ("{0,-28} {1,-10} {2}" -f $wf, $f[2], $f[3]) $c $(if ($f[5] -ne "") { $f[5].Substring(0, [math]::Min(90, $f[5].Length)) } else { "" }) "DarkRed"
    }
  }
  foreach ($l in (Query "select id, task_name, status, coalesce(assignee_kind,''), to_char(greatest(updated_at, created_at) at time zone 'Europe/Warsaw','HH24:MI:SS') from user_tasks where greatest(updated_at, created_at) >= '$start' order by greatest(updated_at, created_at)")) {
    $f = $l -split "\|"; if (Once "task|$($f[0])|$($f[2])") {
      $c = switch ($f[2]) { "PENDING" { "Yellow" } "IN_PROGRESS" { "Yellow" } "COMPLETED" { "Green" } default { "Gray" } }
      Line $f[4] "user task" ("{0,-34} {1,-12} {2}" -f $f[1], $f[2], $f[3]) $c
    }
  }
  foreach ($l in (Query "select id, channel, coalesce(case_id::text,''), to_char(created_at at time zone 'Europe/Warsaw','HH24:MI:SS') from agency_client_submissions where created_at >= '$start' and deleted_at is null order by created_at")) {
    $f = $l -split "\|"; if (Once "sub|$($f[0])") { Line $f[3] "client" ("submission via " + $f[1] + "  case " + (Short $f[2])) "Magenta" }
  }
  foreach ($l in (Query "select v.id, v.template_id, v.version_no, v.status, v.simulation_flag, to_char(v.created_at at time zone 'Europe/Warsaw','HH24:MI:SS'), v.order_ref from agency_research_document_versions v where v.created_at >= '$start' order by v.created_at")) {
    $f = $l -split "\|"; if (Once "ver|$($f[0])") {
      $sim = if ($f[4] -eq "t") { " (simulation)" } else { "" }
      Line $f[5] "document" ("{0,-26} v{1,-3} {2}{3}" -f $f[1], $f[2], $f[3], $sim) "Blue" ("case " + (Short $f[6])) "DarkGray"
    }
  }
  foreach ($l in (Query "select id, step_id, attempt, status, runner, coalesce((qa_result->>'verdict'),''), coalesce((cost->>'run_total')::text,'0'), to_char(coalesce(finished_at, created_at) at time zone 'Europe/Warsaw','HH24:MI:SS'), order_ref from agency_research_task_runs where coalesce(finished_at, created_at) >= '$start' order by coalesce(finished_at, created_at)")) {
    $f = $l -split "\|"; if (Once "run|$($f[0])|$($f[3])") {
      $c = switch ($f[3]) { "running" { "DarkGray" } "done" { "Green" } "to_fix" { "Yellow" } "paused_budget" { "Yellow" } "failed" { "Red" } "exception" { "Red" } default { "Gray" } }
      $label = if ($f[5] -ne "") { "$($f[3]) ($($f[5]))" } else { $f[3] }
      $cost = [double]$f[6]
      $tail = if ($f[4] -ne "system" -and $cost -gt 0 -and $f[3] -ne "running") { "{0:N2} PLN" -f $cost } else { "" }
      Line $f[7] "step" ("{0,-5} #{1}  {2,-26}" -f $f[1], $f[2], $label) $c $tail
    }
  }
  foreach ($l in (Query "select id, agent_id, status, coalesce(model,''), coalesce(input_tokens,0), coalesce(output_tokens,0), coalesce(cost_minor,0), to_char(coalesce(completed_at, created_at) at time zone 'Europe/Warsaw','HH24:MI:SS'), coalesce(latency_ms,0) from agent_runs where coalesce(completed_at, created_at) >= '$start' and status <> 'running' order by coalesce(completed_at, created_at)")) {
    $f = $l -split "\|"; if (Once "agent|$($f[0])") {
      $agent = $f[1] -replace "^agency_(research|tov|operations)\.", ""
      $model = ($f[3] -replace "^openrouter/", "") -replace "^anthropic/", ""
      $tokens = "{0}k/{1}k" -f [math]::Round([int]$f[4] / 1000), [math]::Round([int]$f[5] / 1000)
      $secs = [math]::Round([int]$f[8] / 1000)
      $c = if ($f[2] -eq "ok") { "DarkGreen" } else { "DarkRed" }
      Line $f[7] "agent" ("{0,-38} {1,-16} {2,-9} {3,3}s" -f $agent, $model, $tokens, $secs) $c $f[2] $(if ($f[2] -eq "ok") { "DarkGreen" } else { "Red" })
    }
  }
  Start-Sleep -Seconds 2
}
