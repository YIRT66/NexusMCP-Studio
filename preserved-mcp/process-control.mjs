import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const directory=path.dirname(fileURLToPath(import.meta.url));
function pidValue(pid){if(!Number.isInteger(pid)||pid<=0)throw new Error('PID 必须是正整数');return pid;}
async function windows(action,args){return new Promise((resolve,reject)=>{let out='',err='';const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(directory,'process-control.ps1')],{windowsHide:true,stdio:['pipe','pipe','pipe']});const timer=setTimeout(()=>{child.kill();reject(new Error('进程调试操作超时，请核实目标进程状态'));},25000);child.stdin.on('error',()=>{});child.stdin.end(Buffer.from(JSON.stringify({action,...args})).toString('base64'));child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',value=>out+=value);child.stderr.on('data',value=>err+=value);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);if(code!==0)reject(new Error((err||out).slice(-3000)));else{try{resolve(JSON.parse(out.trim()));}catch{reject(new Error('进程调试器返回了无效数据'));}}});});}
async function linuxIdentity(pid){
 pidValue(pid);const[stat,status,executable]=await Promise.all([fs.readFile(`/proc/${pid}/stat`,'utf8'),fs.readFile(`/proc/${pid}/status`,'utf8'),fs.readlink(`/proc/${pid}/exe`)]);const fields=stat.slice(stat.lastIndexOf(')')+2).trim().split(/\s+/);const value=name=>Number(status.match(new RegExp('^'+name+':\\s+(\\d+)','m'))?.[1]||0)*1024;
 return {pid,name:status.match(/^Name:\s+(.+)$/m)?.[1]||'',executable,startIdentity:pid+':'+fields[19],state:fields[0],memory:{residentBytes:value('VmRSS'),virtualBytes:value('VmSize'),dataBytes:value('VmData'),stackBytes:value('VmStk'),swapBytes:value('VmSwap')}};
}
function address(value){if(typeof value!=='string'||!/^0x[\da-f]+$/i.test(value))throw new Error('地址需为 0x 开头的十六进制字符串');const parsed=BigInt(value);if(parsed>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('地址超出当前读取器可表示的范围');return Number(parsed);}
export async function processMemory({pid,section='summary',query='',offset=0,limit=100,address:at,bytes=256,expectedStartIdentity}){
 pidValue(pid);if(process.platform==='win32')return windows('memory',{pid,section,query,offset,limit,address:at,bytes,expectedStartIdentity});if(process.platform!=='linux')throw new Error('进程内存调试目前支持 Windows 和 Linux');
 const info=await linuxIdentity(pid);if(expectedStartIdentity&&expectedStartIdentity!==info.startIdentity)throw new Error('目标进程已变化，请重新查询 PID 与 startIdentity');
 if(section==='summary')return info;
 if(section==='read'){
  if(!Number.isInteger(bytes)||bytes<1||bytes>65536)throw new Error('单次读取需为 1–65536 字节');const position=address(at),file=await fs.open(`/proc/${pid}/mem`,'r');
  try{const buffer=Buffer.alloc(bytes),result=await file.read(buffer,0,bytes,position),content=buffer.subarray(0,result.bytesRead);return {...info,address:at,bytesRead:result.bytesRead,hex:content.toString('hex'),base64:content.toString('base64'),utf8:content.toString('utf8')};}finally{await file.close();}
 }
 if(section!=='regions')throw new Error('未知内存查询类型');
 const entries=(await fs.readFile(`/proc/${pid}/maps`,'utf8')).trim().split('\n').filter(Boolean).map(line=>{const match=line.match(/^([\da-f]+)-([\da-f]+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)\s*(.*)$/i);if(!match)return null;const[,start,end,permissions,fileOffset,device,inode,module]=match;return {start:'0x'+start,end:'0x'+end,sizeBytes:Number(BigInt('0x'+end)-BigInt('0x'+start)),permissions,fileOffset:'0x'+fileOffset,device,inode,module};}).filter(Boolean).filter(entry=>!query||`${entry.module} ${entry.permissions}`.toLowerCase().includes(query.toLowerCase()));
 return {...info,total:entries.length,regions:entries.slice(offset,offset+limit),nextOffset:offset+limit<entries.length?offset+limit:null};
}
export async function injectLibrary({pid,libraryPath,expectedStartIdentity}){
 pidValue(pid);if(pid===process.pid||pid===process.ppid)throw new Error('不能向 MCP 服务或其父进程注入，请选择明确的目标进程');
 if(!path.isAbsolute(libraryPath)||libraryPath.includes('\0'))throw new Error('动态库必须使用绝对路径');if(!expectedStartIdentity)throw new Error('请先 process_memory 查询目标，再提供其 startIdentity');
 const library=await fs.realpath(libraryPath),file=await fs.open(library,'r');let header;try{header=Buffer.alloc(64);await file.read(header,0,64,0);}finally{await file.close();}
 if(process.platform==='win32'){if(path.extname(library).toLowerCase()!=='.dll'||header.subarray(0,2).toString()!=='MZ')throw new Error('Windows 注入需要有效的 DLL 文件');return windows('inject',{pid,libraryPath:library,expectedStartIdentity});}
 if(process.platform!=='linux')throw new Error('进程注入目前支持 Windows DLL 和 Linux SO');
 if(header.subarray(0,4).toString('hex')!=='7f454c46')throw new Error('Linux 注入需要有效的 ELF 共享库');
 const info=await linuxIdentity(pid);if(info.startIdentity!==expectedStartIdentity)throw new Error('目标进程已变化，请重新查询');
 const target=await fs.open(`/proc/${pid}/exe`,'r');try{const targetHeader=Buffer.alloc(64);await target.read(targetHeader,0,64,0);if(targetHeader[4]!==header[4]||targetHeader.readUInt16LE(18)!==header.readUInt16LE(18))throw new Error('动态库与目标进程架构不一致');}finally{await target.close();}
 const before=await processMemory({pid,section:'regions',query:library,limit:1});if(before.regions.length)return {status:'already-loaded',...info,libraryPath:library};
 const script=['set pagination off','set confirm off',`attach ${pid}`,'python','import gdb, pathlib, json',`pid=${pid}`,`expected=${JSON.stringify(expectedStartIdentity)}`,"raw=pathlib.Path('/proc/'+str(pid)+'/stat').read_text()","actual=str(pid)+':'+raw[raw.rfind(')')+2:].split()[19]","if actual != expected: raise gdb.GdbError('目标进程身份已变化')",`library=${JSON.stringify(library)}`,"result=gdb.parse_and_eval('(void*)dlopen('+json.dumps(library)+', 2)')","if int(result)==0: raise gdb.GdbError('dlopen 返回空指针，请检查动态库依赖和初始化函数')","print('NEXUS_LIBRARY_LOADED')",'end','detach','quit'].join('\n');
 const work=await fs.mkdtemp(path.join(os.tmpdir(),'nexus-gdb-'));const scriptFile=path.join(work,'load.gdb');await fs.writeFile(scriptFile,script,{mode:0o600});
 try{await new Promise((resolve,reject)=>{let result='',errors='';const child=spawn(process.env.NEXUS_GDB_PATH||'gdb',['--batch','--nx','-x',scriptFile],{stdio:['pipe','pipe','pipe']});const timer=setTimeout(()=>{child.kill();reject(new Error('调试器超时，请核实目标进程状态'));},20000);child.stdin.on('error',()=>{});child.stdin.end();child.stdout.on('data',value=>result+=value);child.stderr.on('data',value=>errors+=value);child.once('error',error=>{clearTimeout(timer);reject(new Error(error.code==='ENOENT'?'请安装 gdb 后使用 SO 注入':error.message));});child.once('exit',()=>{clearTimeout(timer);result.includes('NEXUS_LIBRARY_LOADED')?resolve(result):reject(new Error((errors||result||'动态库加载未得到确认').slice(-3000)));});});}finally{await fs.rm(work,{recursive:true,force:true});}
 const after=await processMemory({pid,section:'regions',query:library,limit:1});if(after.startIdentity!==expectedStartIdentity||!after.regions.length)throw new Error('未在目标内存映射中确认动态库，请重新检查进程状态');
 return {status:'loaded',...info,libraryPath:library,region:after.regions[0]};
}
