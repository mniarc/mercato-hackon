# Lists Chrome top-level windows; with -RestoreOldCloseNew restores the minimised one and closes the other.
param([switch]$RestoreOldCloseNew)
Add-Type @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class ChromeWins {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public static List<IntPtr> Find() {
    var list = new List<IntPtr>();
    EnumWindows((h, l) => {
      var cls = new StringBuilder(256); GetClassName(h, cls, 256);
      var title = new StringBuilder(512); GetWindowText(h, title, 512);
      if (cls.ToString() == "Chrome_WidgetWin_1" && IsWindowVisible(h) && title.Length > 0) list.Add(h);
      return true;
    }, IntPtr.Zero);
    return list;
  }
  public static string Title(IntPtr h) { var t = new StringBuilder(512); GetWindowText(h, t, 512); return t.ToString(); }
}
"@
$wins = [ChromeWins]::Find()
foreach ($h in $wins) { "{0}  iconic={1}  {2}" -f $h, [ChromeWins]::IsIconic($h), [ChromeWins]::Title($h) }
if ($RestoreOldCloseNew) {
  $old = $wins | Where-Object { [ChromeWins]::IsIconic($_) } | Select-Object -First 1
  $new = $wins | Where-Object { -not [ChromeWins]::IsIconic($_) } | Select-Object -First 1
  if ($old) { [void][ChromeWins]::ShowWindow($old, 9); "restored $old" }
  if ($new -and $old) { [void][ChromeWins]::PostMessage($new, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero); "closed $new" }
}
