$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$a = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd())) | ConvertFrom-Json
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class NexusProcess {
 [StructLayout(LayoutKind.Sequential)] public struct MBI { public IntPtr BaseAddress; public IntPtr AllocationBase; public uint AllocationProtect; public ushort PartitionId; public UIntPtr RegionSize; public uint State; public uint Protect; public uint Type; }
 [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern bool CloseHandle(IntPtr handle);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern UIntPtr VirtualQueryEx(IntPtr process, IntPtr address, out MBI info, UIntPtr length);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern bool ReadProcessMemory(IntPtr process, IntPtr address, byte[] buffer, UIntPtr size, out UIntPtr read);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern bool WriteProcessMemory(IntPtr process, IntPtr address, byte[] buffer, UIntPtr size, out UIntPtr written);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr VirtualAllocEx(IntPtr process, IntPtr address, UIntPtr size, uint allocation, uint protect);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern bool VirtualFreeEx(IntPtr process, IntPtr address, UIntPtr size, uint freeType);
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern IntPtr GetModuleHandle(string name);
 [DllImport("kernel32.dll", CharSet=CharSet.Ansi, SetLastError=true)] public static extern IntPtr GetProcAddress(IntPtr module, string name);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr CreateRemoteThread(IntPtr process, IntPtr attributes, UIntPtr stack, IntPtr start, IntPtr parameter, uint flags, out uint id);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern bool IsWow64Process(IntPtr process, out bool wow64);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern bool IsWow64Process2(IntPtr process, out ushort processMachine, out ushort nativeMachine);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern bool GetProcessTimes(IntPtr process, out long creation, out long exit, out long kernel, out long user);
}
'@
function Native-Error([string]$message) { $code=[Runtime.InteropServices.Marshal]::GetLastWin32Error(); throw "$message (Win32 $code)。请确认进程仍存在且当前用户具有相应权限。" }
$process = [Diagnostics.Process]::GetProcessById([int]$a.pid)
$identity = "$($process.Id):$($process.StartTime.ToUniversalTime().ToFileTimeUtc())"
if($a.expectedStartIdentity -and $a.expectedStartIdentity -ne $identity) { throw '目标进程已变化，请重新查询 PID 与 startIdentity' }
$info = @{pid=$process.Id;name=$process.ProcessName;executable=$process.MainModule.FileName;startIdentity=$identity;memory=@{residentBytes=$process.WorkingSet64;privateBytes=$process.PrivateMemorySize64;virtualBytes=$process.VirtualMemorySize64}}
$result = $info
$handle = [IntPtr]::Zero
try {
 if($a.action -eq 'memory' -and $a.section -eq 'summary') { $result=$info }
 else {
  $access=0x410
  if($a.action -eq 'inject') { $access=0x43A }
  $handle=[NexusProcess]::OpenProcess($access,$false,$process.Id)
  if($handle -eq [IntPtr]::Zero) { Native-Error '无法打开目标进程' }
  $created=[long]0;$ended=[long]0;$kernelTime=[long]0;$userTime=[long]0
  if(-not [NexusProcess]::GetProcessTimes($handle,[ref]$created,[ref]$ended,[ref]$kernelTime,[ref]$userTime)) { Native-Error '无法核实目标进程身份' }
  if("$($process.Id):$created" -ne $identity) { throw '目标进程已变化，请重新查询' }
  if($a.action -eq 'memory' -and $a.section -eq 'read') {
   if([int]$a.bytes -lt 1 -or [int]$a.bytes -gt 65536) { throw '单次读取需为 1–65536 字节' }
   if([string]$a.address -notmatch '^0x[0-9a-fA-F]+$') { throw '地址需为 0x 开头的十六进制字符串' }
   $address=[Convert]::ToUInt64(([string]$a.address).Substring(2),16)
   $buffer=New-Object byte[] ([int]$a.bytes);$read=[UIntPtr]::Zero
   if(-not [NexusProcess]::ReadProcessMemory($handle,[IntPtr]([long]$address),$buffer,[UIntPtr]$buffer.Length,[ref]$read)) { Native-Error '无法读取指定内存范围' }
   $data=New-Object byte[] ([int]$read.ToUInt64());[Array]::Copy($buffer,$data,$data.Length)
   $result=@{pid=$process.Id;startIdentity=$identity;address=$a.address;bytesRead=$data.Length;hex=([BitConverter]::ToString($data)).Replace('-','').ToLowerInvariant();base64=[Convert]::ToBase64String($data);utf8=[Text.Encoding]::UTF8.GetString($data)}
  } elseif($a.action -eq 'memory' -and $a.section -eq 'regions') {
   $items=New-Object Collections.Generic.List[object];$address=[long]0;$visited=0
   while($visited -lt 32768) {
    $region=New-Object NexusProcess+MBI
    $size=[NexusProcess]::VirtualQueryEx($handle,[IntPtr]$address,[ref]$region,[UIntPtr][Runtime.InteropServices.Marshal]::SizeOf($region))
    if($size -eq [UIntPtr]::Zero) { break };$visited++
    $length=[long]$region.RegionSize.ToUInt64();if($length -le 0) { break }
    if($region.State -ne 0x10000) { $item=@{start=('0x{0:x}' -f $region.BaseAddress.ToInt64());sizeBytes=$length;state=$region.State;protection=$region.Protect;type=$region.Type};if(-not $a.query -or ($item|ConvertTo-Json -Compress).Contains([string]$a.query)){$items.Add($item)} }
    $next=$region.BaseAddress.ToInt64()+$length;if($next -le $address){break};$address=$next
   }
   $offset=[Math]::Max(0,[int]$a.offset);$limit=[Math]::Min(300,[Math]::Max(1,[int]$a.limit))
   $result=@{pid=$process.Id;startIdentity=$identity;total=$items.Count;regions=@($items | Select-Object -Skip $offset -First $limit);truncated=($visited -ge 32768)}
  } elseif($a.action -eq 'inject') {
   $library=[IO.Path]::GetFullPath([string]$a.libraryPath)
   $targetWow=$false;$currentWow=$false
   if(-not [NexusProcess]::IsWow64Process($handle,[ref]$targetWow)) { Native-Error '无法读取目标进程架构' }
   [void][NexusProcess]::IsWow64Process([Diagnostics.Process]::GetCurrentProcess().Handle,[ref]$currentWow)
   if($targetWow -ne $currentWow) { throw '仅支持与当前服务相同位数的目标进程' }
   $machine=[ushort]0;$native=[ushort]0;$selfMachine=[ushort]0;$selfNative=[ushort]0
   if(-not [NexusProcess]::IsWow64Process2($handle,[ref]$machine,[ref]$native)) { Native-Error '无法读取目标架构' }
   if(-not [NexusProcess]::IsWow64Process2([Diagnostics.Process]::GetCurrentProcess().Handle,[ref]$selfMachine,[ref]$selfNative)) { Native-Error '无法读取服务架构' }
   if($machine -eq 0){$machine=$native};if($selfMachine -eq 0){$selfMachine=$selfNative}
   if($machine -ne $selfMachine){throw '目标进程与当前服务架构不一致'}
   $stream=[IO.File]::OpenRead($library)
   try{$reader=New-Object IO.BinaryReader($stream);$stream.Position=0x3c;$peOffset=$reader.ReadInt32();if($peOffset -lt 64 -or $peOffset -gt ($stream.Length-24)){throw 'DLL PE 头无效'};$stream.Position=$peOffset;if($reader.ReadUInt32() -ne 0x4550){throw 'DLL PE 签名无效'};if($reader.ReadUInt16() -ne $machine){throw 'DLL 与目标进程架构不一致'}}finally{$stream.Dispose()}
   $existing=@($process.Modules | Where-Object { $_.FileName -eq $library })
   if($existing.Count -gt 0) { $result=@{status='already-loaded';pid=$process.Id;startIdentity=$identity;libraryPath=$library} }
   else {
    $kernel=[NexusProcess]::GetModuleHandle('kernel32.dll');$loader=[NexusProcess]::GetProcAddress($kernel,'LoadLibraryW');if($loader -eq [IntPtr]::Zero){Native-Error '无法查找动态库加载器'}
    $localModule=@([Diagnostics.Process]::GetCurrentProcess().Modules | Where-Object {$loader.ToInt64() -ge $_.BaseAddress.ToInt64() -and $loader.ToInt64() -lt ($_.BaseAddress.ToInt64()+$_.ModuleMemorySize)})[0]
    $remoteModule=@($process.Modules | Where-Object {$_.ModuleName -eq $localModule.ModuleName})[0]
    if(-not $remoteModule) { throw '无法解析目标进程中的动态库加载器地址' }
    $remoteLoader=[IntPtr]($remoteModule.BaseAddress.ToInt64()+$loader.ToInt64()-$localModule.BaseAddress.ToInt64())
    $bytes=[Text.Encoding]::Unicode.GetBytes($library+[char]0);$remote=[NexusProcess]::VirtualAllocEx($handle,[IntPtr]::Zero,[UIntPtr]$bytes.Length,0x3000,4)
    if($remote -eq [IntPtr]::Zero) { Native-Error '无法分配动态库路径缓冲区' }
    $thread=[IntPtr]::Zero;$release=$true
    try {
     $written=[UIntPtr]::Zero;if(-not [NexusProcess]::WriteProcessMemory($handle,$remote,$bytes,[UIntPtr]$bytes.Length,[ref]$written) -or $written.ToUInt64() -ne $bytes.Length) { Native-Error '无法写入动态库路径' }
     $id=[uint32]0;$thread=[NexusProcess]::CreateRemoteThread($handle,[IntPtr]::Zero,[UIntPtr]::Zero,$remoteLoader,$remote,0,[ref]$id)
     if($thread -eq [IntPtr]::Zero) { Native-Error '无法创建动态库加载线程' }
     $wait=[NexusProcess]::WaitForSingleObject($thread,10000)
     if($wait -eq 258) { $release=$false;$result=@{status='pending';pid=$process.Id;startIdentity=$identity;libraryPath=$library;note='加载线程仍在运行，请查询进程状态，不要重复注入'} }
     elseif($wait -ne 0) { Native-Error '等待动态库加载线程失败' }
     else { $process.Refresh();$loaded=@($process.Modules | Where-Object {$_.FileName -eq $library});if(-not $loaded.Count){throw '未在目标进程中确认动态库，请检查库的架构、依赖及初始化函数'};$result=@{status='loaded';pid=$process.Id;startIdentity=$identity;libraryPath=$library} }
    } finally { if($thread -ne [IntPtr]::Zero){[void][NexusProcess]::CloseHandle($thread)};if($release){[void][NexusProcess]::VirtualFreeEx($handle,$remote,[UIntPtr]::Zero,0x8000)} }
   }
  } else { throw '未知进程调试操作' }
 }
} finally { if($handle -ne [IntPtr]::Zero){[void][NexusProcess]::CloseHandle($handle)} }
$result | ConvertTo-Json -Depth 10 -Compress
