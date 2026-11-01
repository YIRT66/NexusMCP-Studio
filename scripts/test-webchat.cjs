const { _electron }=require('playwright-core');
const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
async function main(){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'nexus-webchat-check-'));
 const {startFixture}=await import('../runtime/webchat-fixture.mjs');const fixture=await startFixture();let app;
 const launch=async()=>{const env={...process.env,NEXUS_TEST_USER_DATA:directory,MCP_NO_TUNNEL:'1'};delete env.ELECTRON_RUN_AS_NODE;app=await _electron.launch({executablePath:require('electron'),args:[root],cwd:root,env});const page=await app.firstWindow();await page.getByRole('button',{name:'打开内置 AI 浏览器',exact:true}).waitFor();return page};
 try{
  let page=await launch();await page.waitForFunction(()=>!!localStorage.getItem('nexus.sessions'));const session=await page.evaluate(()=>JSON.parse(localStorage.getItem('nexus.sessions')).activeSessionId);
  await page.evaluate(({url,session})=>window.nexusDesktop.webchat('open',{provider:'chatgpt',sessionId:session,url}),{url:fixture.url+'/chatgpt',session});
  await page.getByRole('button',{name:'打开内置 AI 浏览器',exact:true}).click();let target=app.windows().find(p=>p.url()===fixture.url+'/chatgpt');
  await page.getByRole('textbox',{name:'任务指令',exact:true}).fill('未登录的消息');await page.getByRole('button',{name:'发送任务',exact:true}).click();await page.locator('.session-inline-error').filter({hasText:'登录'}).waitFor({timeout:5000});assert.equal(await target.evaluate(()=>window.sentMessages?.length||0),0);
  await target.getByRole('button',{name:'模拟登录',exact:true}).click();
  const send=async text=>{await page.getByRole('textbox',{name:'任务指令',exact:true}).fill(text);await page.getByRole('button',{name:'发送任务',exact:true}).click();await page.locator('.session-message.assistant').filter({hasText:'网页收到：'+text}).waitFor({timeout:10000});await page.getByRole('button',{name:'发送任务',exact:true}).waitFor({timeout:10000})};
  const count=app.windows().length;await send('同一会话第一条');await send('同一会话第二条');assert.equal(app.windows().length,count);assert.deepEqual(await target.evaluate(()=>window.sentMessages),['同一会话第一条','同一会话第二条']);console.log('同一客户端会话连续发送：复用同一网页，无新建标签或对话');
  await target.locator('#prompt-textarea').fill('网页直接发送');await target.evaluate(()=>document.querySelector('form').requestSubmit());await page.locator('.session-message.user').filter({hasText:'网页直接发送'}).waitFor({timeout:10000});console.log('网页消息反向同步：通过');
  await page.getByRole('button',{name:'收起内置浏览器',exact:true}).click();await send('收起后继续');assert.equal(app.windows().length,count);console.log('收起后继续发送：通过');
  for(const provider of ['claude','deepseek','gemini','qwen','kimi','doubao']){await page.evaluate(({provider,url,session})=>window.nexusDesktop.webchat('open',{provider,sessionId:session,url}),{provider,url:fixture.url+'/'+provider,session});await send(provider+' 中文');console.log(provider+' DOM 适配：通过')}
  const before=await page.evaluate(()=>window.nexusDesktop.getRuntimeURL());await app.close();app=undefined;page=await launch();const after=await page.evaluate(()=>window.nexusDesktop.getRuntimeURL());assert.equal(after,before);const saved=JSON.parse(await fs.readFile(path.join(directory,'ai-webpages.json'),'utf8'));assert.ok(saved.urls['chatgpt:'+session].includes('/chatgpt'));console.log('会话网页地址持久化、扩展配对端口复用：通过');
  await page.evaluate(({session})=>window.nexusDesktop.webchat('open',{provider:'chatgpt',sessionId:session}),{session});target=app.windows().find(p=>p.url().includes('/chatgpt'));assert.ok(await target.locator('#login').isHidden());console.log('重启后登录状态保留：通过');
 }finally{if(app)await Promise.race([app.close().catch(()=>{}),new Promise(r=>setTimeout(()=>{app.process().kill();r()},7000).unref())]);fixture.server.closeAllConnections();await new Promise(r=>fixture.server.close(r))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
