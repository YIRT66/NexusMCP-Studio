import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {createServer} from 'node:http';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
const root=fileURLToPath(new URL('../',import.meta.url)),output=path.join(root,'output/workbench-ui');await fs.mkdir(output,{recursive:true});
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'nexus-ui-'));
const fixture=createServer(async(req,res)=>{
 let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);res.writeHead(200,{'content-type':'text/event-stream'});
 const packet=value=>res.write('data: '+JSON.stringify(value)+'\n\n');
 if(body.messages.at(-1).role!=='tool'){packet({choices:[{delta:{tool_calls:[{index:0,id:'fixture-system',type:'function',function:{name:'system_read',arguments:'{"section":"overview"}'}}]},finish_reason:'tool_calls'}]});}
 else{const system=JSON.parse(body.messages.at(-1).content);const answer=`已读取当前设备的系统信息。\n\n- **系统**：${system.os} / ${system.arch}\n- **处理器**：${system.cpu.logicalCores} 个逻辑核心\n- **内存**：${(system.memory.totalBytes/1024**3).toFixed(1)} GB\n\n本次调用已完成，可以在时间轴查看参数、输出和实际耗时。`;
 for(let i=0;i<answer.length;i+=12){packet({choices:[{delta:{content:answer.slice(i,i+12)}}]});await new Promise(resolve=>setTimeout(resolve,35));}packet({choices:[{delta:{},finish_reason:'stop'}]});}
 res.end('data: [DONE]\n\n');
});await new Promise(resolve=>fixture.listen(0,'127.0.0.1',resolve));
const child=fork(path.join(root,'runtime/server.mjs'),[],{env:{...process.env,NEXUS_DATA_DIR:directory,NEXUS_PORT:'0',MCP_NO_TUNNEL:'1'},stdio:['ignore','pipe','pipe','ipc']});let diagnostic='',browser;
child.stdout.on('data',v=>diagnostic+=v);child.stderr.on('data',v=>diagnostic+=v);
try{
 const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(diagnostic)),15000);child.on('message',m=>{if(m.type==='runtime.ready'){clearTimeout(timer);resolve(m);}});child.once('error',reject);});
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(ready.url);await page.getByRole('button',{name:'选择模型',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('.runtime-button')?.textContent==='已连接');await page.waitForFunction(async()=>{const r=await fetch('/api/bootstrap');return(await r.json()).service.phase==='running';});
 await page.keyboard.press('Control+,');await page.getByRole('button',{name:'模型',exact:true}).click();
 await page.getByLabel('显示名称',{exact:true}).fill('本地联调模型');await page.getByLabel('API 地址',{exact:true}).fill(`http://127.0.0.1:${fixture.address().port}/v1`);await page.getByLabel('模型 ID',{exact:true}).fill('fixture-system');await page.getByLabel('API Key',{exact:true}).fill('fixture-private-key');await page.getByRole('button',{name:'添加模型',exact:true}).click();await page.getByRole('status').filter({hasText:'模型已保存'}).waitFor();
 await page.getByRole('button',{name:'公网远控',exact:true}).click();await page.getByRole('button',{name:'开启公网访问',exact:true}).waitFor();await page.screenshot({path:path.join(output,'public-access-settings.png')});await page.getByRole('button',{name:'完成',exact:true}).click();
 await page.getByRole('button',{name:'选择模型',exact:true}).click();await page.getByRole('button',{name:'API 模型 通过接口连接'}).click();await page.getByRole('menuitemradio',{name:'本地联调模型 fixture-system'}).waitFor();await page.screenshot({path:path.join(output,'model-picker.png')});await page.keyboard.press('Escape');
 assert.equal((await page.request.get(ready.url+'/api/bootstrap').then(r=>r.json())).service.phase,'running');
 await page.getByRole('button',{name:'选择模型',exact:true}).click();await page.getByRole('button',{name:'API 模型 通过接口连接'}).click();await page.getByRole('menuitemradio',{name:'本地联调模型 fixture-system'}).click();
 for(const text of ['查看当前系统环境并总结可用资源。','再次读取系统信息，核对当前内存。']){await page.getByRole('textbox',{name:'任务指令'}).fill(text);await page.getByRole('textbox',{name:'任务指令'}).press('Enter');await page.getByRole('button',{name:'停止任务',exact:true}).waitFor();await page.getByRole('button',{name:'停止任务',exact:true}).waitFor({state:'hidden'});}
 await page.getByRole('tab',{name:'时间轴',exact:true}).click();const records=page.locator('.trajectory-record');assert.ok(await records.count()>=6);
 await page.getByRole('button',{name:'折叠所有轮次'}).click();assert.equal(await records.count(),0);await page.getByLabel('搜索时间轴').fill('logicalCores');assert.ok(await records.count()>0);await page.getByLabel('搜索时间轴').fill('');await page.getByRole('button',{name:'折叠所有轮次'}).click();
 await page.locator('.trajectory-record.tool').first().click();await page.getByRole('button',{name:'输出',exact:true}).click();await page.getByRole('complementary',{name:'记录详情'}).getByText('logicalCores',{exact:false}).waitFor();
 await page.screenshot({path:path.join(output,'timeline-dark.png')});await page.getByRole('button',{name:'关闭记录详情'}).click();
 const plot=await page.locator('.trajectory-plot').boundingBox();await page.mouse.move(plot.x+plot.width*.1,plot.y+25);await page.mouse.down();await page.mouse.move(plot.x+plot.width*.9,plot.y+25,{steps:12});await page.mouse.up();await page.locator('.trajectory-range').waitFor();await page.getByRole('button',{name:'重置时间轴视图'}).click();await page.getByLabel('时间轴比例').selectOption('duration');
 await page.keyboard.press('Control+,');await page.getByRole('button',{name:'通用设置',exact:true}).click();await page.getByRole('button',{name:'浅色',exact:true}).click();await page.getByRole('button',{name:'完成',exact:true}).click();await page.screenshot({path:path.join(output,'timeline-light.png')});
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'切换侧边栏'}).click();await page.getByRole('button',{name:'关闭侧边栏'}).click();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('.trajectory-record.tool').first().click();await page.screenshot({path:path.join(output,'mobile-timeline.png')});await page.getByRole('button',{name:'关闭记录详情'}).click();await page.getByRole('tab',{name:'对话',exact:true}).click();await page.screenshot({path:path.join(output,'mobile-chat.png')});
 // Upload an actual skill through the browser, then let the real installer inspect it.
 await page.getByRole('button',{name:'切换侧边栏'}).click();await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'插件',exact:true}).click();await page.getByRole('button',{name:'安装插件或技能'}).click();await page.locator('.extension-kind-picker button').filter({hasText:'技能'}).click();await page.locator('.extension-install-dialog input[type=file]').setInputFiles({name:'SKILL.md',mimeType:'text/markdown',buffer:Buffer.from('---\nname: 浏览器上传技能\ndescription: 网页真实上传测试\n---\n已通过网页导入。')});await page.getByRole('button',{name:'安装技能',exact:true}).click();await page.getByRole('heading',{name:'浏览器上传技能',exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log('网页版实际 API 聊天、模型分组、时间轴搜索/折叠/详情/拖选、手机布局、公网设置及技能上传：通过。截图：'+output);
}finally{await browser?.close();if(child.connected){child.send({type:'shutdown'});await new Promise(resolve=>{child.once('exit',resolve);setTimeout(()=>{child.kill();resolve();},8000).unref();});}fixture.closeAllConnections();await new Promise(resolve=>fixture.close(resolve));await fs.rm(directory,{recursive:true,force:true});}
