const {app,WebContentsView}=require('electron');
const fs=require('node:fs');
const path=require('node:path');

const providers=[
 {id:'chatgpt',name:'ChatGPT',url:'https://chatgpt.com/'},
 {id:'claude',name:'Claude',url:'https://claude.ai/new'},
 {id:'deepseek',name:'DeepSeek',url:'https://chat.deepseek.com/'},
 {id:'gemini',name:'Gemini',url:'https://gemini.google.com/app'},
 {id:'qwen',name:'Qwen',url:'https://chat.qwen.ai/'},
 {id:'kimi',name:'Kimi',url:'https://www.kimi.com/'},
 {id:'doubao',name:'豆包',url:'https://www.doubao.com/chat/'},
];
class WebChat{
 constructor(window,publish,stateFile){
  this.window=window;this.publish=publish;this.pages=new Map();this.provider='chatgpt';this.sessionId='default';
  this.job=null;this.visible=false;this.opening=false;this.lastState='';this.polling=false;this.disposed=false;
  const pluginDirectory=app.isPackaged?path.join(process.resourcesPath,'browser-plugin'):path.join(__dirname,'../browser-plugin');
  this.source=fs.readFileSync(path.join(pluginDirectory,'adapter.js'),'utf8');
  this.stateFile=stateFile;this.savedURLs={};this.savedProviders={};this.lastHistory='';try{const saved=JSON.parse(fs.readFileSync(stateFile,'utf8'));this.savedURLs=saved.urls||saved;this.savedProviders=saved.providers||{}}catch{}
  this.timer=setInterval(()=>void this.poll(),600);
 }
 key(provider=this.provider,session=this.sessionId){return provider+':'+session}
 page(){const page=this.pages.get(this.key());return page&&!page.webContents.isDestroyed()?page:undefined}
 saveURL(key,url){if(!this.stateFile||!/^https?:\/\//i.test(url))return;this.savedURLs[key]=url;try{fs.writeFileSync(this.stateFile,JSON.stringify({urls:this.savedURLs,providers:this.savedProviders}),{mode:0o600})}catch(e){console.error('保存 AI 网页地址失败：'+e.message)}}
 async activate(sessionId){
  if(this.job&&sessionId!==this.sessionId)throw new Error('请先等待当前回复结束，再切换客户端会话');
  if(sessionId===this.sessionId)return this.state();
  const provider=this.savedProviders[sessionId]||this.provider;
  if(this.pages.has(this.key(provider,sessionId))||this.savedURLs[this.key(provider,sessionId)])return this.open(provider,undefined,sessionId);
  this.hide();this.sessionId=sessionId;this.provider=provider;this.status='新会话，打开 AI 浏览器后开始新的网页对话';this.lastHistory='';this.changed();return this.state();
 }
 state(){return {providers,provider:this.provider,sessionId:this.sessionId,url:this.page()?.webContents.getURL()||'',visible:this.visible,busy:!!this.job,status:this.status||'请打开 AI 网页并登录',replyMode:'mcp',requestId:this.job?.requestId}}
 emit(type,data){if(!this.window.isDestroyed())this.window.webContents.send('webchat:event',{type,data});this.publish?.(type,data)}
 changed(){const value=this.state(),serialized=JSON.stringify(value);if(serialized===this.lastState)return;this.lastState=serialized;this.emit('webchat.state',value)}
 async open(id=this.provider,url,sessionId=this.sessionId){
  if(this.opening)throw new Error('浏览器正在打开网页，请稍后重试');
  if(this.disposed)throw new Error('浏览器已关闭');
  if(url&&!['http:','https:'].includes(new URL(url).protocol))throw new Error('浏览器仅支持 HTTP/HTTPS');
  const definition=providers.find(p=>p.id===id);if(!definition)throw new Error('不支持的 AI 网站');
  if(typeof sessionId!=='string'||sessionId.length>150)throw new Error('会话 ID 无效');
  if(this.job&&(id!==this.provider||sessionId!==this.sessionId||url))throw new Error('请先停止当前网页回复，再切换网页');
  const changed=id!==this.provider||sessionId!==this.sessionId;
  const wasVisible=this.visible,rect=this.rect;
  if(changed){this.hide();this.lastHistory=''}this.provider=id;this.sessionId=sessionId;this.savedProviders[sessionId]=id;
  let view=this.page();this.opening=true;
  try{
   if(!view){
    if(this.pages.size>=30){const oldest=[...this.pages].find(([key])=>key!==this.key());if(oldest){oldest[1].webContents.close();this.pages.delete(oldest[0])}}
    view=new WebContentsView({webPreferences:{partition:'persist:nexus-ai-websites',nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
    this.pages.set(this.key(),view);const wc=view.webContents;
    wc.session.setPermissionRequestHandler((_w,permission,callback)=>callback(['clipboard-sanitized-write','fullscreen'].includes(permission)));
    wc.setWindowOpenHandler(({url:next})=>/^https?:\/\//i.test(next)?{action:'allow',overrideBrowserWindowOptions:{parent:this.window,autoHideMenuBar:true,width:900,height:760,webPreferences:{partition:'persist:nexus-ai-websites',nodeIntegration:false,contextIsolation:true,sandbox:true}}}:{action:'deny'});
    wc.on('will-navigate',(event,next)=>{if(!/^https?:\/\//i.test(next))event.preventDefault()});
    const key=this.key();const navigated=()=>{this.saveURL(key,wc.getURL());this.changed()};
    wc.on('did-navigate',navigated);wc.on('did-navigate-in-page',navigated);
    wc.on('render-process-gone',()=>{this.status='网页进程已退出，请刷新网页';if(this.job){this.job=null;this.emit('agent.status',{phase:'idle'})}this.changed()});
    await wc.loadURL(url||this.savedURLs[key]||definition.url);
   }else if(url)await view.webContents.loadURL(url);
   if(wasVisible&&rect)this.show(rect);
   this.status='网页已打开，正在检查登录状态';this.changed();return this.state();
  }finally{this.opening=false}
 }
 show(rect){
  if(this.window.isDestroyed())return;const view=this.page();this.rect=rect;
  if(!view||!rect)return;const bounds=this.window.getContentBounds();
  const x=Math.min(bounds.width-1,Math.max(0,Math.round(rect.x))),y=Math.min(bounds.height-1,Math.max(40,Math.round(rect.y)));
  this.window.contentView.addChildView(view);view.setBounds({x,y,width:Math.min(bounds.width-x,Math.max(1,Math.round(rect.width))),height:Math.min(bounds.height-y,Math.max(1,Math.round(rect.height)))});
  this.visible=true;this.changed();
 }
 hide(){for(const view of this.pages.values()){try{this.window.contentView.removeChildView(view)}catch{}}this.visible=false;this.changed()}
 async inspect(operation='inspect',text){
  const view=this.page();if(!view||view.webContents.isDestroyed())throw new Error('请先打开 AI 网页并登录');
  return view.webContents.executeJavaScriptInIsolatedWorld(997,[{code:this.source+'\n;globalThis.nexusWebchatAdapter('+JSON.stringify({operation,text,provider:this.provider})+')'}]);
 }
 async send(data){
  if(this.opening)throw new Error('网页正在加载，请稍后再发送');
  if(this.job)throw new Error('上一条网页回复尚未完成，请等待或停止');
  if(typeof data?.text!=='string'||!data.text.trim()||data.text.length>100000)throw new Error('消息为空或超过 100000 字符');
  if(data.attachments?.length)throw new Error('网页附件请在内置浏览器中上传，本次未发送文字');
  if(!this.page())throw new Error('请先打开内置 AI 浏览器并完成登录');
  if(data.sessionId&&data.sessionId!==this.sessionId)await this.open(this.provider,undefined,data.sessionId);
  if(!data.requestId||data.replyVia!=='mcp')throw new Error('客户端消息缺少 MCP 回复标识，请更新客户端');
  const before=await this.inspect('status');if(!before.ready)throw new Error('请先打开内置浏览器，完成网站登录后再发送');
  const id=data.requestId,job={id,requestId:data.requestId,sessionId:data.sessionId,started:Date.now(),sending:true};
  this.job=job;this.emit('agent.status',{phase:'executing'});this.changed();
  try{
   let prompt=data.text;
   if(data.goal)prompt='当前任务目标：'+String(data.goal).slice(0,10000)+'\n\n'+prompt;
   if(data.planning)prompt='请先给出计划，在我确认前不要执行电脑操作。\n\n'+prompt;
   prompt+='\n\n【NexusMCP 客户端回复路由】\n'+JSON.stringify({requestId:data.requestId,sessionId:data.sessionId})+'\n请使用当前对话已启用的 NexusMCP 完成任务，并调用 client_reply：requestId/sessionId 使用上述原值，text 为给用户看的 Markdown，done=true。不要只在网页里回答，软件通过 MCP 接收回复。长回复可分段 done=false，最后 done=true。';
   await this.inspect('send',prompt);job.sending=false;this.status='等待 GPT 通过 MCP 回复';this.changed();
  }catch(e){this.job=null;this.emit('agent.status',{phase:'idle'});this.changed();throw e}
  return {id};
 }
 async stop(){
  if(!this.job)return;
  const result=await this.inspect('stop');
  if(!result.stopped&&result.busy)throw new Error('网页仍在生成，未找到停止按钮，请打开网页手动停止');
  if(!result.stopped&&this.job.sending)throw new Error('消息仍在提交，请稍后再停止');
  this.job=null;this.emit('agent.status',{phase:'idle'});this.changed();
 }
 async poll(){
  if(this.polling||this.opening||!this.pages.size||this.window.isDestroyed()||this.disposed)return;this.polling=true;
  try{const key=this.key();const snapshot=await this.inspect('status');if(key!==this.key())return;this.status=this.job?(Date.now()-this.job.started>120000?'仍在等待 MCP 回复，请确认 GPT 已启用 client_reply 工具':'等待 GPT 通过 MCP 回复'):(snapshot.ready?'网页已就绪，回复通道为 MCP':'请在内置浏览器中完成登录');this.changed()}
  catch(e){this.status=e.message;this.changed()}finally{this.polling=false}
 }
 async command(op,data={}){
  if(op==='reply.received'){if(this.job?.requestId===data.requestId){this.job=null;this.status='MCP 回复已接收';this.emit('agent.status',{phase:'idle'});this.changed()}return {ok:true}}if(op==='state')return this.state();if(op==='activate')return this.activate(data.sessionId);if(op==='open')return this.open(data.provider,data.url,data.sessionId);if(op==='send')return this.send(data);if(op==='stop')return this.stop();
  if(op==='back'){if(this.page()?.webContents.navigationHistory.canGoBack())this.page().webContents.navigationHistory.goBack();return}
  if(op==='reload'){if(this.job)throw new Error('请先停止网页回复再刷新');this.page()?.webContents.reload();return}
  throw new Error('未知浏览器操作');
 }
 async dispose(){if(this.disposed)return;this.disposed=true;clearInterval(this.timer);this.job=null;this.hide();for(const v of this.pages.values())if(!v.webContents.isDestroyed())v.webContents.close();this.pages.clear()}
}
module.exports={WebChat,providers};
