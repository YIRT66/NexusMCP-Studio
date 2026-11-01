$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class HanSystem {
 public delegate bool EnumWindowProc(IntPtr h, IntPtr p);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowProc cb, IntPtr p);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h,StringBuilder text,int count);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h,int index);
 [DllImport("user32.dll",CharSet=CharSet.Unicode,EntryPoint="SendMessageTimeoutW")] static extern IntPtr SendText(IntPtr h,uint m,IntPtr w,string s,uint flags,uint timeout,out IntPtr result);
 [DllImport("user32.dll",CharSet=CharSet.Unicode,EntryPoint="SendMessageTimeoutW")] static extern IntPtr ReadText(IntPtr h,uint m,IntPtr w,StringBuilder s,uint flags,uint timeout,out IntPtr result);
 public static string Class(IntPtr h){var s=new StringBuilder(256);GetClassName(h,s,256);return s.ToString();}
 public static bool IsEdit(IntPtr h){var s=Class(h).ToUpperInvariant();return s=="EDIT"||s.Contains(".EDIT.");}
 public static bool IsPassword(IntPtr h){return IsEdit(h)&&(GetWindowLong(h,-16)&32)!=0;}
 public static string Value(IntPtr h){if(!IsEdit(h)||IsPassword(h))return null;IntPtr r;var s=new StringBuilder(1001);ReadText(h,13,(IntPtr)1001,s,2,200,out r);return s.ToString();}
 public static void SetValue(IntPtr h,string value){if(!IsEdit(h)||(GetWindowLong(h,-16)&2048)!=0)throw new Exception("Native edit is unavailable or read-only.");IntPtr r;if(SendText(h,12,IntPtr.Zero,value,2,1000,out r)==IntPtr.Zero)throw new Exception("Native edit did not respond.");}
 public static void Click(IntPtr h){var c=Class(h).ToUpperInvariant();if(c!="BUTTON"&&!c.Contains(".BUTTON."))throw new Exception("Control has no supported invoke method.");IntPtr r;if(SendText(h,245,IntPtr.Zero,null,2,1000,out r)==IntPtr.Zero)throw new Exception("Native button did not respond.");}
 public static List<object> Windows() {
  var list=new List<object>();var foreground=GetForegroundWindow();
  EnumWindows((h,p)=>{if(!IsWindowVisible(h))return true;var s=new StringBuilder(1024);GetWindowText(h,s,s.Capacity);if(s.Length==0)return true;uint pid;GetWindowThreadProcessId(h,out pid);list.Add(new {handle=h.ToInt64().ToString(),pid,title=s.ToString(),foreground=h==foreground});return list.Count<500;},IntPtr.Zero);return list;
 }
}
'@
[void][HanSystem]::SetProcessDPIAware()
$snapshots = @{}
function Get-Pattern($element, [string]$name) {
  $pattern = $null
  $type = 'System.Windows.Automation.' + $name + 'Pattern'
  $id = ([type]$type)::Pattern
  if ($element.TryGetCurrentPattern($id, [ref]$pattern)) { return $pattern }
  return $null
}
function Get-Root($a) {
  $handle = [HanSystem]::GetForegroundWindow()
  if ($a.handle) { $handle = [IntPtr]([long]$a.handle) }
  if ($handle -eq [IntPtr]::Zero) { throw 'No active window. Use system_read windows and specify handle.' }
  return [Windows.Automation.AutomationElement]::FromHandle($handle)
}
function Read-Ui($a) {
  $root = Get-Root $a
  $maxNodes = 100; if ($null -ne $a.maxNodes) { $maxNodes = [int]$a.maxNodes }
  $maxDepth = 6; if ($null -ne $a.maxDepth) { $maxDepth = [int]$a.maxDepth }
  $textBudget = 8000; if ($null -ne $a.maxText) { $textBudget = [int]$a.maxText }
  $offset = [int]$a.offset
  $nodes = New-Object 'Collections.Generic.List[object]'
  $refs = @{}
  $queue = New-Object 'Collections.Generic.Queue[object]'
  $queue.Enqueue(@{element=$root;depth=0;parent=$null})
  $walker = [Windows.Automation.TreeWalker]::ControlViewWalker
  $watch = [Diagnostics.Stopwatch]::StartNew()
  $visited = 0; $matched = 0; $truncated = $false
  while ($queue.Count -gt 0) {
    if ($visited -ge 4000 -or $watch.ElapsedMilliseconds -gt 6000) { $truncated=$true; break }
    $entry=$queue.Dequeue(); $element=$entry.element; $visited++
    try {
      $c=$element.Current
      $native=[IntPtr]$c.NativeWindowHandle
      $isPassword=$c.IsPassword -or [HanSystem]::IsPassword($native)
      $ref=($element.GetRuntimeId() -join '.')
      $matches = (-not $a.query -or ($c.Name+' '+$c.AutomationId+' '+$c.ControlType.ProgrammaticName).IndexOf([string]$a.query,[StringComparison]::OrdinalIgnoreCase) -ge 0)
      if ($matches) {
        $matched++
        if ($matched -gt $offset) {
          $refs[$ref]=$element
          $patterns=@($element.GetSupportedPatterns() | ForEach-Object { $_.ProgrammaticName.Replace('PatternIdentifiers.Pattern','') })
          $value=$null; $content=$null
          if (-not $isPassword -and $textBudget -gt 0) {
            $v=Get-Pattern $element 'Value'
            if ($v) { $value=[string]$v.Current.Value; if ($value.Length -gt [Math]::Min(1000,$textBudget)) {$value=$value.Substring(0,[Math]::Min(1000,$textBudget))};$textBudget-=$value.Length }
            elseif ([HanSystem]::IsEdit($native)) {$value=[HanSystem]::Value($native);if($value.Length -gt $textBudget){$value=$value.Substring(0,$textBudget)};$textBudget-=$value.Length}
            if ($textBudget -gt 0 -and $c.ControlType -eq [Windows.Automation.ControlType]::Document) {
              $t=Get-Pattern $element 'Text'
              if ($t) { $content=$t.DocumentRange.GetText($textBudget); $textBudget-=$content.Length }
            }
          }
          $r=$c.BoundingRectangle
          $name=([string]$c.Name).Substring(0,[Math]::Min(250,([string]$c.Name).Length));if($isPassword){$name='[protected input]'}
          $nodes.Add(@{ref=$ref;parentRef=$entry.parent;depth=$entry.depth;name=$name;automationId=$c.AutomationId;type=$c.ControlType.ProgrammaticName.Replace('ControlType.','');className=$c.ClassName;nativeEdit=[HanSystem]::IsEdit($native);enabled=$c.IsEnabled;offscreen=$c.IsOffscreen;focused=$c.HasKeyboardFocus;password=$isPassword;value=$value;text=$content;patterns=$patterns;bounds=@{x=$r.X;y=$r.Y;width=$r.Width;height=$r.Height}})
          if ($nodes.Count -ge $maxNodes) { $truncated=$true;break }
        }
      }
      if ($entry.depth -lt $maxDepth) {
        $child=$walker.GetFirstChild($element)
        while ($null -ne $child -and $queue.Count -lt 4000 -and $watch.ElapsedMilliseconds -le 6000) {
          $queue.Enqueue(@{element=$child;depth=$entry.depth+1;parent=$ref})
          $child=$walker.GetNextSibling($child)
        }
      }
    } catch { continue }
  }
  $id=[Guid]::NewGuid().ToString('N')
  foreach ($key in @($snapshots.Keys)) { if (((Get-Date)-$snapshots[$key].created).TotalSeconds -gt 120) { $snapshots.Remove($key) } }
  if ($snapshots.Count -ge 8) { $old=$snapshots.Keys | Sort-Object {$snapshots[$_].created} | Select-Object -First 1; $snapshots.Remove($old) }
  $snapshots[$id]=@{created=Get-Date;refs=$refs}
  return @{snapshotId=$id;handle=$root.Current.NativeWindowHandle.ToString();pid=$root.Current.ProcessId;title=$root.Current.Name;nodes=@($nodes.ToArray());visited=$visited;offset=$offset;nextOffset=$(if($truncated -and $nodes.Count -gt 0){$offset+$nodes.Count}else{$null});truncated=$truncated;elapsedMs=$watch.ElapsedMilliseconds;expiresInSeconds=120}
}
while ($null -ne ($line=[Console]::ReadLine())) {
  $id=$null
  try {
    $a=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($line)) | ConvertFrom-Json
    $id=$a.id
    $limit=100;if($a.limit){$limit=[int]$a.limit}
    $result=$null
    switch ($a.action) {
      'screenshot' {
        $r=[Windows.Forms.SystemInformation]::VirtualScreen
        $bitmap=New-Object Drawing.Bitmap($r.Width,$r.Height)
        $graphics=[Drawing.Graphics]::FromImage($bitmap)
        $stream=New-Object IO.MemoryStream
        $scaled=$null
        try {
          $graphics.CopyFromScreen($r.X,$r.Y,0,0,$r.Size)
          if($a.maxWidth -and $r.Width -gt $a.maxWidth){$scaled=New-Object Drawing.Bitmap($bitmap,[Drawing.Size]::new([int]$a.maxWidth,[int]($r.Height*$a.maxWidth/$r.Width)))}
          if($scaled){$scaled.Save($stream,[Drawing.Imaging.ImageFormat]::Png)}else{$bitmap.Save($stream,[Drawing.Imaging.ImageFormat]::Png)}
          $result=@{image=[Convert]::ToBase64String($stream.ToArray());x=$r.X;y=$r.Y;width=$r.Width;height=$r.Height}
        }finally{if($scaled){$scaled.Dispose()};$stream.Dispose();$graphics.Dispose();$bitmap.Dispose()}
      }
      'windows' { $items=@([HanSystem]::Windows()); if($a.query){$items=@($items | Where-Object {$_.title.IndexOf([string]$a.query,[StringComparison]::OrdinalIgnoreCase) -ge 0})};$result=@{windows=@($items | Select-Object -Skip ([int]$a.offset) -First $limit);total=$items.Count} }
      'processes' { $items=@(Get-Process | Where-Object {(-not $a.pid -or $_.Id -eq $a.pid) -and (-not $a.query -or $_.ProcessName.IndexOf([string]$a.query,[StringComparison]::OrdinalIgnoreCase) -ge 0)} | Sort-Object WorkingSet64 -Descending);$result=@{total=$items.Count;processes=@($items | Select-Object -Skip ([int]$a.offset) -First $limit | ForEach-Object {@{pid=$_.Id;name=$_.ProcessName;memoryBytes=$_.WorkingSet64;cpuSeconds=$_.CPU;responding=$_.Responding}})} }
      'services' { $items=@(Get-Service | Where-Object {-not $a.query -or ($_.Name+' '+$_.DisplayName).IndexOf([string]$a.query,[StringComparison]::OrdinalIgnoreCase) -ge 0});$result=@{total=$items.Count;services=@($items | Select-Object -Skip ([int]$a.offset) -First $limit | ForEach-Object {@{name=$_.Name;displayName=$_.DisplayName;status=$_.Status.ToString()}})} }
      'disks' { $result=@{disks=@(Get-CimInstance Win32_LogicalDisk | ForEach-Object {@{name=$_.DeviceID;fileSystem=$_.FileSystem;sizeBytes=$_.Size;freeBytes=$_.FreeSpace;type=$_.DriveType}})} }
      'network' { $items=@(Get-NetTCPConnection -ErrorAction Stop | Where-Object {-not $a.pid -or $_.OwningProcess -eq $a.pid});$result=@{total=$items.Count;connections=@($items | Select-Object -Skip ([int]$a.offset) -First $limit | ForEach-Object {@{localAddress=$_.LocalAddress;localPort=$_.LocalPort;remoteAddress=$_.RemoteAddress;remotePort=$_.RemotePort;state=$_.State.ToString();pid=$_.OwningProcess}})} }
      'ui_read' { $result=Read-Ui $a }
      'ui_act' {
        $snapshot=$snapshots[[string]$a.snapshotId]
        if (-not $snapshot -or ((Get-Date)-$snapshot.created).TotalSeconds -gt 120) { throw 'UI snapshot expired. Read the window again.' }
        $results=New-Object 'Collections.Generic.List[object]'
        foreach($step in $a.steps) {
          try {
            $element=$snapshot.refs[[string]$step.ref]
            if (-not $element) { throw 'Unknown control ref. Read the window again.' }
            $c=$element.Current
            if (-not $c.IsEnabled) { throw 'Control is disabled.' }
            switch($step.action) {
              'invoke' {$p=Get-Pattern $element 'Invoke';if($p){$p.Invoke()}else{[HanSystem]::Click([IntPtr]$c.NativeWindowHandle)}}
              'set_value' {$p=Get-Pattern $element 'Value';if($p){if($p.Current.IsReadOnly){throw 'Control is read-only.'};$p.SetValue([string]$step.value)}else{[HanSystem]::SetValue([IntPtr]$c.NativeWindowHandle,[string]$step.value)}}
              'toggle' {$p=Get-Pattern $element 'Toggle';if(-not $p){throw 'Control does not support TogglePattern.'};$p.Toggle()}
              'select' {$p=Get-Pattern $element 'SelectionItem';if(-not $p){throw 'Control does not support SelectionItemPattern.'};$p.Select()}
              'expand' {$p=Get-Pattern $element 'ExpandCollapse';if(-not $p){throw 'Control does not support ExpandCollapsePattern.'};$p.Expand()}
              'collapse' {$p=Get-Pattern $element 'ExpandCollapse';if(-not $p){throw 'Control does not support ExpandCollapsePattern.'};$p.Collapse()}
              'focus' {$element.SetFocus()}
              'read' { }
              default {throw 'Unknown UI action.'}
            }
            $value=$null;if(-not $c.IsPassword -and -not [HanSystem]::IsPassword([IntPtr]$c.NativeWindowHandle)){$p=Get-Pattern $element 'Value';if($p){$value=([string]$p.Current.Value);if($value.Length -gt 2000){$value=$value.Substring(0,2000)}}else{$value=[HanSystem]::Value([IntPtr]$c.NativeWindowHandle)}}
            $results.Add(@{action=$step.action;ref=$step.ref;ok=$true;value=$value})
          }catch{$results.Add(@{action=$step.action;ref=$step.ref;ok=$false;error=$_.Exception.Message});break}
        }
        $result=@{results=@($results.ToArray())}
      }
      default {throw 'Unknown system read action.'}
    }
    @{id=$id;ok=$true;result=$result} | ConvertTo-Json -Depth 18 -Compress
  } catch { @{id=$id;ok=$false;error=$_.Exception.Message} | ConvertTo-Json -Depth 4 -Compress }
}
