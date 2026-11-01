import {ExtensionManager} from './extensions.mjs';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const data=await fs.mkdtemp(path.join(os.tmpdir(),'nexus-extension-network-'));
const seen=new Map();const manager=new ExtensionManager(data,(type,value)=>{if(type==='extensions.changed')for(const e of value){const next=e.status+':'+e.enabled;if(seen.get(e.id)!==next){seen.set(e.id,next);console.log(e.kind+' '+e.name+' → '+e.status+(e.error?' '+e.error:''))}}});
await manager.init();
try{
 const packages=[
  {kind:'skill',name:'Git 技能测试',source:{type:'git',value:'https://github.com/anthropics/skills.git'}},
  {kind:'plugin',name:'npm MCP 测试',source:{type:'registry',value:'npm:@modelcontextprotocol/server-memory@2.0.1'}},
  {kind:'plugin',name:'PyPI MCP 测试',source:{type:'registry',value:'pypi:mcp-server-time==2026.10.28'}},
 ];
 const entries=await Promise.all(packages.map(body=>manager.install(body)));
 const deadline=Date.now()+290000;
 while(Date.now()<deadline){const latest=manager.list().filter(e=>entries.some(i=>i.id===e.id));if(latest.every(e=>e.status!=='installing')){for(const e of latest)if(e.status==='error')throw new Error(e.name+'：'+e.error);console.log(JSON.stringify(latest.map(e=>({name:e.name,status:e.status,connected:e.connected,tools:e.toolCount,skills:e.skillCount}))));break}await new Promise(r=>setTimeout(r,500))}
 const latest=manager.list();if(latest.some(e=>e.status!=='installed'))throw new Error('网络安装未全部完成');
 const git=latest.find(e=>e.kind==='skill');if(!git?.skillCount)throw new Error('Git 技能未实际加载');
 const memoryTool=manager.toolManifest().find(t=>t.description.includes('[npm MCP 测试]')&&t.originalName==='read_graph');
 if(!memoryTool)throw new Error('npm MCP 未注册 read_graph');const graph=await manager.call(memoryTool.name,{});if(graph.isError)throw new Error(JSON.stringify(graph));
 const timeTool=manager.toolManifest().find(t=>t.description.includes('[PyPI MCP 测试]')&&t.originalName==='get_current_time');if(!timeTool)throw new Error('PyPI MCP 未注册时间工具');const time=await manager.call(timeTool.name,{timezone:'Asia/Hong_Kong'});if(time.isError)throw new Error(JSON.stringify(time));
 console.log('Git / npm / PyPI 下载、安装、MCP 连接及实际调用全部通过。');
}finally{await manager.dispose()}
