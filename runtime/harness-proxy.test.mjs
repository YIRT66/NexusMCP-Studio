import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import express from 'express';
import {HarnessProxy} from './harness-proxy.mjs';
test('原生代理在 Express 已消费空 JSON 后仍完整转发请求体和私有 Cookie',async t=>{
 const native=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;if(req.method==='GET'){res.setHeader('set-cookie','native-private=fixture; HttpOnly');res.end('ready');return;}res.setHeader('content-type','application/json');res.end(JSON.stringify({body:JSON.parse(raw),cookie:req.headers.cookie}));});await new Promise(resolve=>native.listen(0,'127.0.0.1',resolve));t.after(()=>{native.closeAllConnections();native.close();});
 const proxy=new HarnessProxy({start:async()=>({running:true,url:`http://127.0.0.1:${native.address().port}/?token=fixture`})});t.after(()=>proxy.close());
 const app=express();app.use(express.json());app.use((req,res,next)=>proxy.handle(req,res,next));const server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();server.close();});
 for(const body of [{},{value:42}]){const response=await fetch(`http://127.0.0.1:${server.address().port}/native/test`,{method:'POST',headers:{'content-type':'application/json',cookie:'share-private=never-forward'},body:JSON.stringify(body),signal:AbortSignal.timeout(3000)});assert.equal(response.status,200);assert.equal(response.headers.get('set-cookie'),null);assert.deepEqual(await response.json(),{body,cookie:'native-private=fixture'});}
});
