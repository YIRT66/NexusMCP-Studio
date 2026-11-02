import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {spawn,execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {processMemory,injectLibrary} from '../preserved-mcp/process-control.mjs';
test('进程调试：读取明确地址、身份校验、实际 DLL/SO 加载与防重复',{timeout:120000,skip:!['linux','win32'].includes(process.platform)},async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nexus-process-fixture-'));let child;
 t.after(async()=>{if(child&&child.exitCode===null){await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill('SIGKILL');},3000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.stdin.end('\n');});}await fs.rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
 const win=process.platform==='win32',target=path.join(dir,win?'target.exe':'target'),library=path.join(dir,win?'fixture.dll':'fixture.so'),marker=path.join(dir,'loaded.txt');
 await fs.writeFile(path.join(dir,'target.c'),`#include <stdio.h>\n#ifdef _WIN32\n#include <windows.h>\n#else\n#include <sys/prctl.h>\n#endif\nchar nexus_value[]="NEXUS_OWNED_MEMORY_FIXTURE";\nint main(){\n#ifndef _WIN32\nprctl(PR_SET_PTRACER, PR_SET_PTRACER_ANY, 0, 0, 0);\n#endif\nprintf("%p\\n",(void*)nexus_value);fflush(stdout);getchar();return 0;}`);
 await fs.writeFile(path.join(dir,'library.c'),`#include <stdio.h>\n#include <stdlib.h>\n#ifdef _WIN32\n#include <windows.h>\nBOOL WINAPI DllMain(HINSTANCE h,DWORD reason,LPVOID unused){if(reason==DLL_PROCESS_ATTACH){FILE*f=fopen(getenv("NEXUS_FIXTURE_MARKER"),"w");if(f){fputs("loaded",f);fclose(f);}}return TRUE;}\n#else\n__attribute__((constructor)) static void fixture(){FILE*f=fopen(getenv("NEXUS_FIXTURE_MARKER"),"w");if(f){fputs("loaded",f);fclose(f);}}\n#endif`);
 if(win){execFileSync('cl.exe',['/nologo','target.c',`/Fe:${target}`],{cwd:dir});execFileSync('cl.exe',['/nologo','/LD','library.c',`/Fe:${library}`],{cwd:dir});}
 else{execFileSync('cc',['-g','-O0','-o',target,'target.c'],{cwd:dir});execFileSync('cc',['-shared','-fPIC','-o',library,'library.c'],{cwd:dir});}
 child=spawn(target,[],{env:{...process.env,NEXUS_FIXTURE_MARKER:marker},stdio:['pipe','pipe','pipe']});
 const address=await new Promise((resolve,reject)=>{child.stdout.once('data',value=>resolve('0x'+value.toString().trim().replace(/^0x/,'')));child.once('error',reject);});
 const info=await processMemory({pid:child.pid});assert.equal(info.pid,child.pid);assert.ok(info.startIdentity);
 const memory=await processMemory({pid:child.pid,section:'read',address,bytes:24,expectedStartIdentity:info.startIdentity});assert.match(memory.utf8,/NEXUS_OWNED_MEMORY/);
 const regions=await processMemory({pid:child.pid,section:'regions',limit:3});assert.ok(regions.total>0);assert.ok(regions.regions.length<=3);
 await assert.rejects(injectLibrary({pid:child.pid,libraryPath:library,expectedStartIdentity:'stale:identity'}),/进程已变化/);
 let loaded;try{loaded=await injectLibrary({pid:child.pid,libraryPath:library,expectedStartIdentity:info.startIdentity});}catch(error){if(!win&&/extended state status|请安装 gdb/.test(error.message)){t.skip('当前环境缺少可用 gdb 或内核 XSAVE 不兼容；内存读取及身份校验已验证');return;}throw error;}assert.equal(loaded.status,'loaded');assert.equal(await fs.readFile(marker,'utf8'),'loaded');
 assert.equal((await injectLibrary({pid:child.pid,libraryPath:library,expectedStartIdentity:info.startIdentity})).status,'already-loaded');
});
