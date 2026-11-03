import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ApiModels} from './api-models.mjs';
import {ClientReplies} from './client-replies.mjs';
const until=async callback=>{for(let i=0;i<150;i++){const value=await callback();if(value)return value;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error('等待条件超时');};
async function fixture(t,handler){const server=createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();server.close();});return `http://127.0.0.1:${server.address().port}/v1`;}
async function setup(t,baseUrl,overrides={}){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'nexus-api-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const events=[];const publish=(type,data)=>events.push({type,data});const replies=new ClientReplies(directory,publish);await replies.init();const models=new ApiModels(directory,{publish,replies,tools:()=>[],call:async()=>{throw new Error('unexpected tool');},...overrides});await models.init();t.after(()=>models.stop());const profile=await models.configure({name:'测试模型',provider:'测试接口',model:'fixture-model',baseUrl,apiKey:'fixture-secret-key'});return {models,replies,profile,events,directory};}
function stream(response,packet){response.write('data: '+JSON.stringify(packet)+'\r\n\r\n');}
test('API 流式回复、工具循环、只读工具过滤和私密配置',async t=>{
 let rounds=0,called=0;const requests=[];
 const url=await fixture(t,async(request,response)=>{assert.equal(request.url,'/v1/chat/completions');assert.equal(request.headers.authorization,'Bearer fixture-secret-key');let raw='';for await(const chunk of request)raw+=chunk;const body=JSON.parse(raw);requests.push(body);response.writeHead(200,{'content-type':'text/event-stream'});rounds++;
 if(rounds===1){stream(response,{choices:[{delta:{tool_calls:[{index:0,id:'tool-1',type:'function',function:{name:'read_fixture',arguments:'{"value":'}}]}}]});stream(response,{choices:[{delta:{tool_calls:[{index:0,function:{arguments:'42}'}}]},finish_reason:'tool_calls'}]});}
 else{assert.equal(body.messages.at(-1).role,'tool');stream(response,{choices:[{delta:{content:'你好，'}}]});stream(response,{choices:[{delta:{content:'这是完成的回答。'},finish_reason:'stop'}],usage:{prompt_tokens:20,completion_tokens:8,total_tokens:28}});}
 response.end('data: [DONE]\n\n');});
 const state=await setup(t,url,{tools:()=>[{name:'read_fixture',description:'读取',readOnly:true,inputSchema:{type:'object',properties:{value:{type:'number'}}}},{name:'write_fixture',description:'修改',readOnly:false}],call:async(name,args,request)=>{called++;assert.equal(name,'read_fixture');assert.equal(args.value,42);assert.equal(request.sessionId,'A');return {content:[{type:'text',text:'读取结果 42'}]};}});
 await state.models.start({profileId:state.profile.id,sessionId:'A',text:'读取后回答',permission:'readonly'});await until(()=>state.models.states.A?.busy===false);assert.equal(state.replies.requests[0].status,'completed');assert.equal(state.replies.requests[0].text,'你好，这是完成的回答。');assert.equal(called,1);assert.ok(requests.every(request=>request.tools.every(tool=>tool.function.name!=='write_fixture')));
 assert.equal(state.replies.messages()[0].usage.total_tokens,28);assert.equal(state.replies.messages()[0].source,'api');assert.equal(JSON.stringify(state.models.list()).includes('fixture-secret-key'),false);
 await state.models.configure({...state.profile,apiKey:''});assert.equal(state.models.profiles[0].apiKey,'fixture-secret-key');const mode=(await fs.stat(path.join(state.directory,'api-models.json'))).mode&0o777;if(process.platform!=='win32')assert.equal(mode,0o600);
});
test('API 停止会中断流；连接中断保留已接收正文且不假报完成',async t=>{
 let truncate=false;const url=await fixture(t,async(request,response)=>{request.resume();response.writeHead(200,{'content-type':'text/event-stream'});stream(response,{choices:[{delta:{content:'已经收到的前半段'}}]});if(truncate)response.end();});
 const state=await setup(t,url);await state.models.start({profileId:state.profile.id,sessionId:'A',text:'长回复'});await until(()=>state.replies.requests[0].text);await state.models.stop('A');await until(()=>!state.models.jobs.size);assert.equal(state.replies.requests[0].status,'cancelled');assert.equal(state.replies.requests[0].text,'已经收到的前半段');
 truncate=true;await state.models.start({profileId:state.profile.id,sessionId:'A',text:'测试断流'});await until(()=>state.models.states.A?.busy===false);assert.equal(state.replies.requests[1].status,'failed');assert.match(state.models.states.A.error,/中断/);assert.ok(state.replies.requests[1].text);
});

test('API 思考单独流式显示，工具续轮回传 reasoning_content，等级写入实际请求',async t=>{
 let round=0;const requests=[];const url=await fixture(t,async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);requests.push(body);res.writeHead(200,{'content-type':'text/event-stream'});if(++round===1){stream(res,{choices:[{delta:{reasoning_content:'先读取真实结果。'}}]});stream(res,{choices:[{delta:{tool_calls:[{index:0,id:'read',type:'function',function:{name:'read_fixture',arguments:'{}'}}]},finish_reason:'tool_calls'}]});}else{stream(res,{choices:[{delta:{reasoning_content:'根据结果作答。'}}]});stream(res,{choices:[{delta:{content:'结果已验证。'},finish_reason:'stop'}]});}res.end('data: [DONE]\n\n');});
 const state=await setup(t,url,{tools:()=>[{name:'read_fixture',description:'读取',readOnly:true}],call:async()=>({content:[{type:'text',text:'42'}]})});await state.models.configure({...state.profile,reasoningMode:'effort'});await state.models.start({profileId:state.profile.id,sessionId:'think',text:'读取后回复',reasoningEffort:'high'});await until(()=>state.models.states.think?.busy===false);
 assert.equal(requests[0].reasoning_effort,'high');assert.equal(requests[1].messages.find(m=>m.tool_calls)?.reasoning_content,'先读取真实结果。');const message=state.replies.messages()[0];assert.equal(message.content,'结果已验证。');assert.equal(message.reasoning,'先读取真实结果。根据结果作答。');assert.equal(message.reasoningStatus,'completed');assert.equal(message.content.includes('先读取'),false);
});
