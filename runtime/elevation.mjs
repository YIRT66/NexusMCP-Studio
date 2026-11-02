import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The Electron renderer and website stay under the desktop user. Only the
// computer-control worker runs as root after the OS authentication dialog.
export function spawnControlWorker(executable, options, elevated = false) {
  const server = fileURLToPath(new URL('../preserved-mcp/server.mjs', import.meta.url));
  if (!elevated || process.platform !== 'linux' || process.getuid?.() === 0) return spawn(executable,[server],options);
  const proxy = fileURLToPath(new URL('./elevation-proxy.mjs', import.meta.url));
  return spawn(executable,[proxy,executable],options);
}
export function startPrivileged(executable, environment) {
  const worker = fileURLToPath(new URL('./elevation-worker.mjs', import.meta.url));
  const child = spawn('pkexec',[executable,worker],{cwd:path.dirname(worker),stdio:['pipe','pipe','pipe']});
  child.stdin.on('error',()=>{});
  let authenticated = false;
  const queued = [];
  const lines = createInterface({input:child.stdout});
  lines.on('line',line=>{
    let message;try{message=JSON.parse(line);}catch{process.stderr.write(line+'\n');return;}
    if(message.type==='elevation.authenticated'){
      authenticated=true;
      child.stdin.write(JSON.stringify({type:'elevation.environment',environment})+'\n');
      for(const data of queued)child.stdin.write(JSON.stringify(data)+'\n');queued.length=0;
    }else process.send?.(message);
  });
  const send=data=>{if(authenticated)child.stdin.write(JSON.stringify(data)+'\n');else queued.push(data);};
  return {child,send};
}
