import {spawn} from 'node:child_process';
import {defaultShell} from './shell.mjs';
const active=new Set();
function terminate(child,signal='SIGTERM'){try{if(process.platform==='linux')process.kill(-child.pid,signal);else child.kill(signal);}catch{}}
export function cancelCommands(requestId){for(const job of active)if(!requestId||job.requestId===requestId)job.stop();}
export function runCommand({command,cwd,timeoutMs=30000,maxOutput=64000},requestId){
 return new Promise((resolve,reject)=>{
  const started=Date.now(),shell=defaultShell();
  const args=process.platform==='win32'?['-NoLogo','-NoProfile','-Command',command]:['-lc',command];
  const child=spawn(shell,args,{cwd,windowsHide:true,detached:process.platform==='linux',stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',truncated=false,timedOut=false,cancelled=false,forced;
  const stop=()=>{cancelled=true;terminate(child);forced=setTimeout(()=>terminate(child,'SIGKILL'),1000);forced.unref();};
  const job={requestId,stop};active.add(job);
  const timer=setTimeout(()=>{timedOut=true;stop();},timeoutMs);
  const append=(kind,chunk)=>{const remaining=maxOutput-stdout.length-stderr.length;if(chunk.length>remaining)truncated=true;const text=chunk.slice(0,Math.max(0,remaining));if(kind==='stdout')stdout+=text;else stderr+=text;};
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',s=>append('stdout',s));child.stderr.on('data',s=>append('stderr',s));
  child.once('error',error=>{clearTimeout(timer);clearTimeout(forced);active.delete(job);reject(error);});
  child.once('close',(exitCode,signal)=>{clearTimeout(timer);clearTimeout(forced);active.delete(job);resolve({command,cwd:cwd||process.cwd(),exitCode,signal,stdout,stderr,truncated,timedOut,cancelled,durationMs:Date.now()-started});});
 });
}
