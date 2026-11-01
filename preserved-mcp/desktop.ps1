param([Parameter(Mandatory=$true)][string]$Payload)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
if ($Payload -eq '__STDIN__') { $Payload = [Console]::In.ReadToEnd() }
$a = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Payload)) | ConvertFrom-Json
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class HanDesktop {
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint dx,uint dy,int data,UIntPtr extra);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int command);
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h,uint message,IntPtr w,IntPtr l);
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int height,uint flags);
}
'@
[void][HanDesktop]::SetProcessDPIAware()
$result = @{ok=$true}
switch ($a.action) {
 'screenshot' {
  $r = [Windows.Forms.SystemInformation]::VirtualScreen
  $bitmap = New-Object Drawing.Bitmap($r.Width,$r.Height)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $stream = New-Object IO.MemoryStream
  try {
   $graphics.CopyFromScreen($r.X,$r.Y,0,0,$r.Size)
   $bitmap.Save($stream,[Drawing.Imaging.ImageFormat]::Png)
   $result = @{image=[Convert]::ToBase64String($stream.ToArray());x=$r.X;y=$r.Y;width=$r.Width;height=$r.Height}
  } finally { $graphics.Dispose(); $bitmap.Dispose(); $stream.Dispose() }
 }
 {$_ -in 'click','double_click','right_click','move','scroll'} {
  if ($null -eq $a.x -or $null -eq $a.y) { throw '鼠标操作必须提供 x 和 y' }
  [void][HanDesktop]::SetCursorPos($a.x,$a.y)
  if ($a.action -eq 'scroll') { [HanDesktop]::mouse_event(0x800,0,0,[int]$a.delta,[UIntPtr]::Zero) }
  elseif ($a.action -ne 'move') {
   $down = 2; $up = 4
   if ($a.action -eq 'right_click') { $down=8; $up=16 }
   $count=1; if ($a.action -eq 'double_click') { $count=2 }
   for ($i=0;$i -lt $count;$i++) { [HanDesktop]::mouse_event($down,0,0,0,[UIntPtr]::Zero); [HanDesktop]::mouse_event($up,0,0,0,[UIntPtr]::Zero) }
  }
 }
 'keys' { [Windows.Forms.SendKeys]::SendWait([string]$a.text) }
 'type' {
  # 剪贴板粘贴保留中文；操作完成后恢复原文本。
  $old = [Windows.Forms.Clipboard]::GetText()
  try { [Windows.Forms.Clipboard]::SetText([string]$a.text); [Windows.Forms.SendKeys]::SendWait('^v'); Start-Sleep -Milliseconds 200 }
  finally { if ($old) { [Windows.Forms.Clipboard]::SetText($old) } else { [Windows.Forms.Clipboard]::Clear() } }
 }
 'clipboard_read' { $result=@{text=[Windows.Forms.Clipboard]::GetText()} }
 'clipboard_write' { if ($a.text) { [Windows.Forms.Clipboard]::SetText([string]$a.text) } else { [Windows.Forms.Clipboard]::Clear() } }
 'windows' { $result=@{windows=@(Get-Process | Where-Object {$_.MainWindowHandle -ne 0} | ForEach-Object {@{pid=$_.Id;name=$_.ProcessName;title=$_.MainWindowTitle;handle=$_.MainWindowHandle.ToString()}})} }
 'focus' { $handle=[IntPtr]([long]$a.handle); [void][HanDesktop]::ShowWindow($handle,9); $result=@{ok=[HanDesktop]::SetForegroundWindow($handle)} }
 'window_control' {
  $handle=[IntPtr]([long]$a.handle)
  if (-not [HanDesktop]::IsWindow($handle)) { throw '窗口句柄无效，请重新读取窗口列表' }
  switch($a.operation) {
   'focus' {[void][HanDesktop]::ShowWindow($handle,9);$result=@{ok=[HanDesktop]::SetForegroundWindow($handle)}}
   'minimize' {[void][HanDesktop]::ShowWindow($handle,6)}
   'maximize' {[void][HanDesktop]::ShowWindow($handle,3)}
   'restore' {[void][HanDesktop]::ShowWindow($handle,9)}
   'close' {$result=@{ok=[HanDesktop]::PostMessage($handle,0x0010,[IntPtr]::Zero,[IntPtr]::Zero);note='已发送关闭请求，应用可能显示保存提示'} }
   'topmost' {$result=@{ok=[HanDesktop]::SetWindowPos($handle,[IntPtr](-1),0,0,0,0,0x0003)}}
   'unpin' {$result=@{ok=[HanDesktop]::SetWindowPos($handle,[IntPtr](-2),0,0,0,0,0x0003)}}
   default {throw '未知窗口操作'}
  }
 }
 default { throw '未知桌面操作' }
}
$result | ConvertTo-Json -Depth 5 -Compress
