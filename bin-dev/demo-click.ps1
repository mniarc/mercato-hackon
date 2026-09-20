# Synthetic click at logical screen coordinates after focusing Chrome (remote-session helper).
#   .\bin-dev\demo-click.ps1 -X 653 -Y 22
param([int]$X, [int]$Y, [switch]$NoActivate)
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class DemoMouse {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  public struct POINT { public int X; public int Y; }
}
"@
if (-not $NoActivate) {
  $chrome = Get-Process chrome | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  $shell = New-Object -ComObject WScript.Shell
  [void]$shell.AppActivate($chrome.Id)
  Start-Sleep -Milliseconds 300
}
[void][DemoMouse]::SetCursorPos($X, $Y)
Start-Sleep -Milliseconds 150
[DemoMouse]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 80
[DemoMouse]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 700
$p = New-Object DemoMouse+POINT; [void][DemoMouse]::GetCursorPos([ref]$p)
"clicked at $($p.X),$($p.Y); chrome: " + ((Get-Process chrome | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1).MainWindowTitle)
