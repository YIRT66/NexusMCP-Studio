import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {BrowserTools} from './browser-tools.mjs';
const {parse}=createRequire(import.meta.url)('../browser-plugin/tool-protocol.js');
test('无 MCP 网页协议：请求绑定、只读权限、工具结果回合、防止重复执行与停止',async()=>{
 const request={requestId:'r',sessionId:'s',mode:'mcp',status:'waiting',permission:'workspace'};
 const data={protocol:'nexus-tool-v1',requestId:'r',sessionId:'s',calls:[{id:'one',name:'file_write',args:{path:'/tmp/example',content:'中文'}}]};
 assert.equal(parse('```nexus-tool\n'+JSON.stringify(data)+'\n```','wrong','s'),null);
 assert.equal(parse('', 'r','s',[JSON.stringify(data)]).calls[0].name,'file_write');
 assert.throws(()=>parse(JSON.stringify({...data,calls:[...data.calls,...data.calls]}),'r','s'),/ID/);
 let called=0,delivered;
 const bridge=new BrowserTools({replies:{requests:[request]},tools:()=>[{name:'file_write',enabled:true,readOnly:false}],call:async()=>{called++;return {content:[{type:'text',text:'成功'}]};},deliver:async result=>{delivered=result;}});
 await bridge.execute(data);assert.equal(called,1);assert.equal(delivered.results[0].output,'成功');await bridge.execute(data);assert.equal(called,1);
 await assert.rejects(bridge.execute({...data,calls:[{...data.calls[0],args:{other:true}}]}),/ID/);
 request.permission='readonly';await assert.rejects(bridge.execute({...data,calls:[{...data.calls[0],id:'two'}]}),/权限/);
 request.status='cancelled';await assert.rejects(bridge.execute(data),/停止/);assert.equal(called,1);
});
