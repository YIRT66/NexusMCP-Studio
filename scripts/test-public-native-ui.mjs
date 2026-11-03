import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
const root=fileURLToPath(new URL('../',import.meta.url)),directory=await fs.mkdtemp(path.join(os.tmpdir(),'nexus-public-ui-')),marker=path.join(directory,'gateway.json'),binary=path.join(directory,'cloudflared-fixture');
await fs.writeFile(binary,'#!/usr/bin/env node\n'+`require('fs').writeFileSync(${JSON.stringify(marker)},JSON.stringify({url:process.argv.at(-1)}));console.error('https://nexus-ui-fixture.trycloudflare.com');console.error('Registered tunnel connection');setInterval(()=>{},1000);`,{mode:0o700});
const child=fork(path.join(root,'runtime/server.mjs'),[],{env:{...process.env,NEXUS_DATA_DIR:directory,NEXUS_PORT:'0',MCP_NO_TUNNEL:'1',CLOUDFLARED_PATH:binary},stdio:['ignore','pipe','pipe','ipc']});let logs='',browser;child.stdout.on('data',v=>logs+=v);child.stderr.on('data',v=>logs+=v);
try{
 const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(logs)),15000);child.on('message',m=>{if(m.type==='runtime.ready'){clearTimeout(timer);resolve(m);}});});
 const api=async(route,body)=>{const response=await fetch(ready.url+'/api'+route,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});assert.ok(response.ok,await response.clone().text());return response.json();};
 await api('/harness/start',{});await api('/public-access/start',{});let share;for(let i=0;i<100;i++){share=await api('/public-access');if(share.phase==='running')break;await new Promise(r=>setTimeout(r,50));}assert.equal(share.phase,'running');const gateway=JSON.parse(await fs.readFile(marker,'utf8')).url;
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],sockets=[];page.on('pageerror',error=>errors.push(error.message));page.on('websocket',socket=>{sockets.push(socket.url());});
 await page.goto(gateway+new URL(share.url).pathname);await page.getByRole('button',{name:'选择模型',exact:true}).waitFor({timeout:90000});assert.equal(await page.evaluate(()=>window.__nexusHarness.version),'0.2.1-rc.5');await page.waitForFunction(()=>document.querySelector('.desktop-shell'));
 // The native SDK transport must also traverse the authenticated portal.
 for(let i=0;i<100&&!sockets.some(url=>url.includes('/api/remote'));i++)await new Promise(r=>setTimeout(r,50));assert.ok(sockets.some(url=>url.includes('/api/remote')),'原生 SDK WebSocket 必须通过分享门户');assert.ok(sockets.some(url=>url.endsWith('/ws')));
 await page.getByRole('button',{name:'选择模型',exact:true}).click();await page.getByRole('menu',{name:'选择模型',exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.keyboard.press('Escape');assert.deepEqual(errors,[]);
 await api('/public-access/stop',{});console.log('分享门户：授权 Cookie、原生主窗口、主程序与官方 SDK 双 WebSocket、模型菜单及撤销：通过。');
}finally{await browser?.close();if(child.connected){child.send({type:'shutdown'});await new Promise(resolve=>{child.once('exit',resolve);setTimeout(()=>{child.kill();resolve();},10000).unref();});}await fs.rm(directory,{recursive:true,force:true});}
