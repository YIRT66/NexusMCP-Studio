import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {WebchatRelay} from './webchat-relay.mjs';
const require=createRequire(new URL('../preserved-mcp/package.json',import.meta.url));const {WebSocket,WebSocketServer}=require('ws');
test('浏览器扩展桥接：本机配对、消息转发、会话 ID 和断线错误',async()=>{
 const events=[];const relay=new WebchatRelay((type,data)=>events.push({type,data}));const server=createServer();const wss=new WebSocketServer({noServer:true});server.on('upgrade',(req,socket,head)=>{if(!relay.accepts(req)){socket.destroy();return}wss.handleUpgrade(req,socket,head,ws=>relay.connect(ws))});server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const socket=new WebSocket(`ws://127.0.0.1:${server.address().port}/webchat/extension/${relay.token}`,{origin:'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'});await new Promise((r,j)=>{socket.once('open',r);socket.once('error',j)});
 try{
  const requests=[];socket.on('message',raw=>{const message=JSON.parse(raw);requests.push(message);if(message.operation==='send')socket.send(JSON.stringify({type:'result',id:message.id,result:{sessionId:message.data.sessionId,text:message.data.text}}))});
  const first=await relay.command('send',{sessionId:'client-session-A',text:'第一条'});const second=await relay.command('send',{sessionId:'client-session-A',text:'第二条'});assert.equal(first.sessionId,second.sessionId);assert.equal(requests.length,2);
  socket.send(JSON.stringify({type:'event',event:{type:'webchat.history',data:{sessionId:'client-session-A',messages:[{role:'user',content:'第一条'}]}}}));await new Promise(r=>setTimeout(r,20));assert.ok(events.some(e=>e.type==='webchat.history'&&e.data.sessionId==='client-session-A'));
  assert.equal(relay.accepts({url:'/webchat/extension/wrong',headers:{origin:'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'}}),false);
  const pending=relay.command('activate',{sessionId:'client-session-B'});socket.close();await assert.rejects(pending,/断开/);assert.equal(relay.state.busy,false);
 }finally{relay.close();for(const ws of wss.clients)ws.terminate();wss.close();server.closeAllConnections();await new Promise(r=>server.close(r))}
});
