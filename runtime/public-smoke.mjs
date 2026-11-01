import {fork} from 'node:child_process';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import https from 'node:https';
import {Client} from '../preserved-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StreamableHTTPClientTransport} from '../preserved-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';

const directory=await fs.mkdtemp(path.join(os.tmpdir(),'nexus-public-smoke-'));
const child=fork(fileURLToPath(new URL('./server.mjs',import.meta.url)),[],{env:{...process.env,NEXUS_PORT:'0',NEXUS_DATA_DIR:directory,MCP_NO_TUNNEL:'0'},stdio:['ignore','pipe','pipe','ipc']});
const client=new Client({name:'Nexus Public Connectivity Test',version:'1.0'});
let logs='';child.stdout.on('data',c=>{logs+=c});child.stderr.on('data',c=>{logs+=c});
try{
 const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('运行时启动超时')),15000);child.on('message',m=>{if(m.type==='runtime.ready'){clearTimeout(timer);resolve(m)}});child.once('error',reject)});
 const post=route=>fetch(ready.url+'/api'+route,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
 await post('/service/start');
 let service;const deadline=Date.now()+110000;
 while(Date.now()<deadline){service=(await(await fetch(ready.url+'/api/bootstrap')).json()).service;if(service.phase==='error')throw new Error(service.error);if(service.phase==='running')break;await new Promise(r=>setTimeout(r,500))}
 if(service?.phase!=='running')throw new Error('公网隧道未就绪');
 console.log('Quick Tunnel 就绪：'+new URL(service.url).hostname);
 let error;let customFetch;
 for(let attempt=0;attempt<12;attempt++){
  try{
   await client.connect(new StreamableHTTPClientTransport(new URL(service.url),customFetch?{fetch:customFetch}:undefined));
   const listed=await client.listTools();
   const result=await client.callTool({name:'computer_info',arguments:{}});
   if(result.isError)throw new Error(JSON.stringify(result));
   console.log(JSON.stringify({publicHandshake:true,toolCount:listed.tools.length,computerInfo:true,dns:customFetch?'DoH（系统 DNS 解析失败）':'系统 DNS'}));error=undefined;break;
  }catch(e){error=e;console.log('等待临时域名可用：'+(e.cause?.code||e.message));await client.close().catch(()=>{});
   if(e.cause?.code==='ENOTFOUND'&&!customFetch){
    const host=new URL(service.url).hostname;
    let answer;
    for(const endpoint of ['https://cloudflare-dns.com/dns-query?name='+host+'&type=A','https://dns.google/resolve?name='+host+'&type=A']){try{answer=await(await fetch(endpoint,{headers:{accept:'application/dns-json'},signal:AbortSignal.timeout(5000)})).json();if(answer.Answer?.some(a=>a.type===1))break}catch{}}
    answer ||= {};
    const address=answer.Answer?.find(a=>a.type===1)?.data;
    if(address)customFetch=async(input,init={})=>new Promise((resolve,reject)=>{
     const url=new URL(String(input));if(url.hostname!==host)return reject(new Error('测试请求地址不匹配'));
     const request=https.request(url,{method:init.method||'GET',headers:Object.fromEntries(new Headers(init.headers)),signal:init.signal,lookup:(_name,options,callback)=>options.all?callback(null,[{address,family:4}]):callback(null,address,4)},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve(new Response([204,205,304].includes(res.statusCode)?null:Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));});request.on('error',reject);request.setTimeout(20000,()=>request.destroy(new Error('公网请求超时')));if(init.body)request.write(init.body);request.end();
    });
   }
   await new Promise(r=>setTimeout(r,2000))}
 }
 if(error)throw error;
 await post('/service/stop');
}catch(e){console.error(e.stack);console.error(logs.slice(-8000));process.exitCode=1}
finally{await client.close().catch(()=>{});if(child.connected){child.send({type:'shutdown'});await new Promise(r=>{child.once('exit',r);setTimeout(()=>{child.kill();r()},8000).unref()})}}
