import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
if(process.getuid?.()!==0)throw new Error('系统尚未授予 root 权限');
const write=process.stdout.write.bind(process.stdout);
process.connected=true;
process.send=message=>write(JSON.stringify(message)+'\n');
console.log=(...args)=>console.error(...args);
let initialized=false;
const queued=[];
const lines=createInterface({input:process.stdin});
lines.on('line',async line=>{
  try{
    const message=JSON.parse(line);
    if(message.type==='elevation.environment'&&!initialized){
      initialized=true;
      Object.assign(process.env,message.environment);
      process.env.SHELL='/bin/bash';
      process.env.NEXUS_PRIVILEGED_HOST='1';
      process.chdir(fileURLToPath(new URL('../',import.meta.url)));
      await import('../preserved-mcp/server.mjs');
      for(const value of queued)process.emit('message',value);queued.length=0;
    }else if(initialized&&process.listenerCount('message'))process.emit('message',message);
    else queued.push(message);
  }catch(error){console.error(error.message);process.exit(1);}
});
lines.once('close',()=>{process.connected=false;process.emit('disconnect');setTimeout(()=>process.exit(),2000).unref();});
process.send({type:'elevation.authenticated'});
