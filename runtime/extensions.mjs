import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Client} from '../preserved-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport} from '../preserved-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import {StreamableHTTPClientTransport} from '../preserved-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';
import {SSEClientTransport} from '../preserved-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/sse.js';
import {ToolListChangedNotificationSchema} from '../preserved-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js';
import platform from '../preserved-mcp/platform.cjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const engine=path.join(root,'preserved-mcp');
const require=createRequire(path.join(engine,'package.json'));
const node=platform.runtimePaths(engine).node;
const hash=value=>createHash('sha256').update(value).digest('hex').slice(0,8);
const clean=value=>String(value||'').replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi,'$1[凭据已隐藏]@').replace(/([?&](?:token|key|secret|password)=)[^&#\s]+/gi,'$1[已隐藏]').slice(-4000);
function within(base,relative){const target=path.resolve(base,relative);const rel=path.relative(base,target);if(rel.startsWith('..')||path.isAbsolute(rel))throw new Error('安装路径超出扩展目录');return target}
export class ExtensionManager{
 constructor(directory,emit=()=>{}){this.directory=path.join(directory,'extensions');this.index=path.join(this.directory,'index.json');this.entries=[];this.connections=new Map();this.connecting=new Map();this.jobs=new Map();this.activations=new Map();this.generations=new Map();this.emit=emit;this.persist=Promise.resolve();this.closing=false;this.suspended=false;}
 async init(){await fs.mkdir(path.join(this.directory,'packages'),{recursive:true});try{const value=JSON.parse(await fs.readFile(this.index,'utf8'));if(!Array.isArray(value))throw new Error('扩展索引格式无效');this.entries=value.filter(e=>/^[a-f0-9-]{36}$/.test(e.id));}catch(e){if(e.code!=='ENOENT')throw e}for(const e of this.entries){if(e.status==='installing'){e.status='error';e.enabled=false;e.error='上次安装或启动未完成，请移除后重新安装，或重新启用'}if(e.enabled)void this.activate(e).catch(error=>this.fail(e,error));}await this.save();}
 public(e){return {id:e.id,name:e.name,kind:e.kind,description:e.description||'',version:e.version,studio:e.studio,enabled:e.enabled,status:e.status,error:e.error||'',source:clean(e.source.value),installedAt:e.installedAt,connected:[...this.connections.values()].some(c=>c.extension===e.id),toolCount:this.toolManifest().filter(t=>t.extensionId===e.id).length,skillCount:(e.skills||[]).length};}
 list(){return this.entries.map(e=>this.public(e));}
 save(){const snapshot=JSON.stringify(this.entries,null,2);this.persist=this.persist.catch(()=>{}).then(async()=>{const temp=this.index+'.tmp';await fs.writeFile(temp,snapshot,{mode:0o600});await fs.rename(temp,this.index)});return this.persist;}
 async changed(){await this.save();this.emit('extensions.changed',this.list());this.emit('extensions.config',this.configuration());}
 configuration(){return {tools:this.toolManifest(),skills:this.entries.filter(e=>e.enabled&&e.status==='installed').flatMap(e=>(e.skills||[]).map((s,i)=>({id:`${e.id}:${i}`,name:s.name,description:s.description,extensionId:e.id,extensionName:e.name})))}}
 toolManifest(){return [...(this.studioHost?.manifest()||[]),...[...this.connections.values()].flatMap(c=>(c.tools||[]).map(t=>({...t,name:`ext_${c.extension.slice(0,8)}_${hash(c.key+'\0'+t.name)}_${t.name.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,35)}`,description:`[${c.label}] ${t.description||t.name}`.slice(0,4000),extensionId:c.extension,connection:c.key,originalName:t.name})))];}
 get(id){const e=this.entries.find(e=>e.id===id);if(!e)throw new Error('扩展不存在或已移除');return e;}
 async install(body){
  if(this.closing)throw new Error('服务正在关闭');if(!['plugin','skill','mcp'].includes(body.kind)||!body.source||!['local','git','registry','mcp'].includes(body.source.type)||typeof body.source.value!=='string'||!body.source.value.trim()||body.source.value.length>4000)throw new Error('扩展安装参数无效');
  if(this.jobs.size>=4)throw new Error('最多同时安装 4 个扩展，请等待当前安装完成');
  if(this.entries.length>=200)throw new Error('最多安装 200 个扩展，请先移除不用的扩展');
  const source={type:body.source.type,value:body.source.value.trim()};
  if(source.type==='mcp'){const url=new URL(source.value);if(!['http:','https:'].includes(url.protocol))throw new Error('MCP 地址仅支持 HTTP/HTTPS');}
  if(this.entries.some(e=>e.kind===body.kind&&e.source.type===source.type&&e.source.value===source.value))throw new Error('这个来源已经安装，请在列表中启用或移除后重装');
  const entry={id:randomUUID(),kind:body.kind,name:String(body.name||path.basename(source.value.replace(/[/\\]+$/,''))||'自定义扩展').slice(0,150),source,enabled:false,status:'installing',installedAt:Date.now(),servers:[],skills:[]};
  this.entries.push(entry);await this.changed();
  this.suspended=false;
  if(source.type==='mcp'){
   entry.servers=[{name:'default',url:source.value,headers:body.headers||{}}];entry.enabled=true;
   void this.activate(entry).catch(e=>this.fail(entry,e));
  }else{
   const destination=within(path.join(this.directory,'packages'),entry.id);
   const worker=spawn(node,[path.join(root,'runtime/extension-install.mjs')],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe','ipc'],env:{...process.env}});
   const job={worker,timer:setTimeout(()=>{void this.cancelJob(entry.id);void this.fail(entry,new Error('扩展安装超过 5 分钟，已停止'))},300000)};this.jobs.set(entry.id,job);
   const diagnostic=[];worker.stdout.on('data',c=>diagnostic.push(clean(c)));worker.stderr.on('data',c=>diagnostic.push(clean(c)));
   worker.on('message',message=>{
    if(!this.entries.includes(entry)||this.closing)return;
    if(message.type==='progress')this.emit('extension.log',{id:entry.id,text:clean(message.text)});
    else if(message.type==='installed'){
     clearTimeout(job.timer);this.jobs.delete(entry.id);Object.assign(entry,message.result,{name:body.name?String(body.name).slice(0,150):message.result.name,enabled:true,status:'installing',error:''});
     void this.changed().then(()=>this.activate(entry)).catch(e=>this.fail(entry,e));
    }else if(message.type==='failed'){clearTimeout(job.timer);this.jobs.delete(entry.id);void this.fail(entry,new Error(message.error));}
   });
   worker.once('error',e=>{clearTimeout(job.timer);this.jobs.delete(entry.id);void this.fail(entry,e)});
   worker.once('exit',code=>{if(this.jobs.get(entry.id)===job){clearTimeout(job.timer);this.jobs.delete(entry.id);void this.fail(entry,new Error('安装进程退出 '+code+' '+diagnostic.join('').slice(-1500)))}});
   worker.once('spawn',()=>worker.send({destination,body:{...body,source}}));
  }
  return this.public(entry);
 }
 async fail(entry,error){if(!this.entries.includes(entry)||this.closing)return;entry.status='error';entry.error=clean(error.message||error);entry.enabled=false;await this.closeConnections(entry.id);await this.changed();}
 async cancelJob(id){const job=this.jobs.get(id);if(!job)return;clearTimeout(job.timer);this.jobs.delete(id);await new Promise(resolve=>{job.worker.once('exit',resolve);if(process.platform==='win32'){const killer=spawn('taskkill.exe',['/PID',String(job.worker.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.once('error',()=>job.worker.kill());}else job.worker.kill();setTimeout(resolve,5000).unref()});}
 async closeConnections(id){await this.studioHost?.deactivate(id);const entries=[...this.connections,...this.connecting].filter(([,c])=>c.extension===id);for(const[key]of entries){this.connections.delete(key);this.connecting.delete(key)}await Promise.allSettled([...new Set(entries.map(([,c])=>c.client))].map(client=>client.close()));}
 async enable(id,enabled){const e=this.get(id);if(typeof enabled!=='boolean')throw new Error('enabled 必须是布尔值');if(this.jobs.has(id))throw new Error('扩展正在安装，请等待安装完成');if(enabled&&!e.servers?.length&&!e.skills?.length&&!e.studio)throw new Error('扩展未安装成功，请移除后重新安装');this.generations.set(id,(this.generations.get(id)||0)+1);e.enabled=enabled;e.error='';if(!enabled){await this.closeConnections(id);e.status='installed';await this.changed()}else{this.suspended=false;e.status='installing';await this.changed();void this.activate(e).catch(error=>this.fail(e,error))}return this.public(e);}
 async activate(entry){
  const prior=this.activations.get(entry.id);if(prior)await prior.catch(()=>{});
  if(this.closing||this.suspended||!this.entries.includes(entry)||!entry.enabled)return;
  const generation=this.generations.get(entry.id)||0;
  const action=(async()=>{
   await this.closeConnections(entry.id);entry.status='installing';await this.changed();
   const base=entry.source.type==='mcp'?root:within(within(path.join(this.directory,'packages'),entry.id),entry.root||'.');
   const candidate=[];
   try{
    await this.studioHost?.activate(entry,base);
    for(const config of entry.servers||[]){
     if(this.closing||this.suspended||!entry.enabled||(this.generations.get(entry.id)||0)!==generation)break;
     const key=entry.id+':'+config.name;const client=new Client({name:'NexusMCP Extension Host',version:'1.2.0'});
     this.connecting.set(key,{extension:entry.id,client});
     let transport;
     if(config.url)transport=new StreamableHTTPClientTransport(new URL(config.url),{requestInit:{headers:config.headers||{}}});
     else{
      const substitute=value=>String(value).replaceAll('${PLUGIN_DIR}',base).replaceAll('${NODE}',node).replaceAll('${PYTHON}',entry.pythonPath||(process.platform==='win32'?'python.exe':'python3'));
      let command=substitute(config.command);let args=(config.args||[]).map(substitute);
      if(['node','node.exe'].includes(command.toLowerCase()))command=node;
      else if(['npx','npx.cmd'].includes(command.toLowerCase())){command=node;args=[path.join(engine,'node_modules/npm/bin/npm-cli.js'),'--ignore-scripts','exec','--yes','--',...args]}
      else if(['npm','npm.cmd'].includes(command.toLowerCase())){command=node;args=[path.join(engine,'node_modules/npm/bin/npm-cli.js'),'--ignore-scripts',...args]}
      else if(command.startsWith('./')||command.startsWith('.\\'))command=within(base,command);
      const env={...process.env,...Object.fromEntries(Object.entries(config.env||{}).map(([k,v])=>[k,substitute(v)]))};delete env.ELECTRON_RUN_AS_NODE;
      transport=new StdioClientTransport({command,args,cwd:config.cwd?within(base,substitute(config.cwd)):base,env,stderr:'pipe'});
      transport.stderr?.on('data',chunk=>this.emit('extension.log',{id:entry.id,text:clean(chunk)}));
     }
     try{await client.connect(transport,{timeout:10000})}catch(error){await client.close().catch(()=>{});if(config.url&&[404,405].includes(error.code)){transport=new SSEClientTransport(new URL(config.url),{requestInit:{headers:config.headers||{}}});await client.connect(transport,{timeout:10000})}else throw error}
     const connection={key,extension:entry.id,label:entry.name,client,tools:[],transport};candidate.push(connection);
     const refresh=async()=>{const list=[];let cursor;do{const page=await client.listTools({cursor},{timeout:10000});list.push(...page.tools);cursor=page.nextCursor;if(list.length>500)throw new Error('单个 MCP 服务超过 500 个工具')}while(cursor);connection.tools=list;};
     await refresh();
     if(this.closing||this.suspended||!entry.enabled||(this.generations.get(entry.id)||0)!==generation){await client.close();continue}
     this.connections.set(key,connection);
     this.connecting.delete(key);
     client.setNotificationHandler(ToolListChangedNotificationSchema,async()=>{try{await refresh();await this.changed()}catch(e){this.emit('extension.log',{id:entry.id,text:clean(e.message)})}});
     client.onclose=()=>{if(this.connections.get(key)===connection){this.connections.delete(key);if(entry.enabled&&!this.closing){entry.status='error';entry.error='MCP 连接已断开，请重新启用';void this.changed()}}};
    }
    if(this.closing||this.suspended||!entry.enabled||(this.generations.get(entry.id)||0)!==generation){for(const c of candidate)await c.client.close().catch(()=>{});return}
    entry.status='installed';entry.error='';await this.changed();
   }catch(e){for(const c of candidate)await c.client.close().catch(()=>{});await this.closeConnections(entry.id);if(this.closing||this.suspended||!entry.enabled||(this.generations.get(entry.id)||0)!==generation)return;throw e}
  })();this.activations.set(entry.id,action);try{await action}finally{if(this.activations.get(entry.id)===action)this.activations.delete(entry.id)}
 }
 async remove(id){const e=this.get(id);e.enabled=false;this.generations.set(id,(this.generations.get(id)||0)+1);await this.cancelJob(id);await this.closeConnections(id);await this.activations.get(id)?.catch(()=>{});const target=within(path.join(this.directory,'packages'),id);if(path.basename(target)!==id)throw new Error('扩展删除路径校验失败');await fs.rm(target,{recursive:true,force:true});this.entries=this.entries.filter(e=>e.id!==id);await this.changed();}
 async readSkill(id,relative){
  const match=String(id).match(/^([a-f0-9-]{36}):(\d+)$/);if(!match)throw new Error('技能 ID 无效');const entry=this.get(match[1]);if(!entry.enabled||entry.status!=='installed')throw new Error('技能未启用');const skill=entry.skills?.[Number(match[2])];if(!skill)throw new Error('技能不存在');
  const base=within(within(path.join(this.directory,'packages'),entry.id),entry.root||'.');const skillFile=within(base,skill.relative);const target=relative?within(path.dirname(skillFile),relative):skillFile;
  const real=await fs.realpath(target);within(base,real);if((await fs.stat(real)).size>2*1024*1024)throw new Error('技能资源文件超过 2 MB');return {id,name:skill.name,path:real,content:await fs.readFile(real,'utf8')};
 }
 async call(name,args){if(this.studioHost?.tools.has(name))return this.studioHost.call(name,args);const tool=this.toolManifest().find(t=>t.name===name);if(!tool)throw new Error('扩展工具未启用或连接已断开');const connection=this.connections.get(tool.connection);return connection.client.callTool({name:tool.originalName,arguments:args},undefined,{timeout:110000});}
 async suspend(){this.suspended=true;for(const e of this.entries)this.generations.set(e.id,(this.generations.get(e.id)||0)+1);await Promise.allSettled([...this.entries].map(e=>this.closeConnections(e.id)));await Promise.allSettled([...this.activations.values()]);for(const e of this.entries)if(e.enabled&&!this.jobs.has(e.id)&&e.status==='installing')e.status='installed';await this.changed();}
 resume(){this.suspended=false;for(const e of this.entries.filter(e=>e.enabled&&!this.jobs.has(e.id)&&((e.servers||[]).some(s=>!this.connections.has(e.id+':'+s.name))||e.status!=='installed'||e.studio&&!this.studioHost?.active.has(e.id))))void this.activate(e).catch(error=>this.fail(e,error));}
 async dispose(){this.closing=true;await Promise.allSettled([...this.jobs.keys()].map(id=>this.cancelJob(id)));for(const e of this.entries){this.generations.set(e.id,(this.generations.get(e.id)||0)+1)}await Promise.allSettled(this.entries.map(e=>this.closeConnections(e.id)));await Promise.allSettled([...this.activations.values()]);await this.persist;}
}
