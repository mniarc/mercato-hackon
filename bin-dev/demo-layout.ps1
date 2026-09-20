# Recording layout: Chrome on the left two thirds, the demo trace console on the right third.
#   .\bin-dev\demo-layout.ps1            # opens the trace console (from now on) and arranges both windows
#   .\bin-dev\demo-layout.ps1 -Since 5   # trace includes the last 5 minutes
param([int]$Since = 0)

Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Win {
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hh, bool repaint);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
}
"@

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$split = [int]($area.Width * 2 / 3)

$launcher = Start-Process powershell -PassThru -ArgumentList @('-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $root 'bin-dev\demo-trace.ps1'), '-Since', "$Since")
# The console may be hosted by Windows Terminal; find the window by the title the trace sets.
$trace = $null
$deadline = (Get-Date).AddSeconds(20)
while ($null -eq $trace -and (Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 300
  $trace = Get-Process WindowsTerminal, powershell -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like 'AI Agency on Open Mercato - trace*' } | Select-Object -First 1
}
if ($null -eq $trace) { $trace = $launcher }

$chrome = Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } | Select-Object -First 1
foreach ($pair in @(@($chrome, $area.X, $split), @($trace, ($area.X + $split), ($area.Width - $split)))) {
  $proc = $pair[0]; if ($null -eq $proc) { continue }
  [void][Win]::ShowWindow($proc.MainWindowHandle, 9)   # SW_RESTORE, so a maximised window accepts the new bounds
  [void][Win]::MoveWindow($proc.MainWindowHandle, $pair[1], $area.Y, $pair[2], $area.Height, $true)
}
if ($chrome) { [void][Win]::SetForegroundWindow($chrome.MainWindowHandle) }
"chrome: {0}x{1} at {2}  |  trace: {3}x{1} at {4}  (pid {5})" -f $split, $area.Height, $area.X, ($area.Width - $split), ($area.X + $split), $trace.Id
