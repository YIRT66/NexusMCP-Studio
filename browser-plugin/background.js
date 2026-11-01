const providers=[{id:'chatgpt',name:'ChatGPT',url:'https://chatgpt.com/'},{id:'claude',name:'Claude',url:'https://claude.ai/new'},{id:'deepseek',name:'DeepSeek',url:'https://chat.deepseek.com/'},{id:'gemini',name:'Gemini',url:'https://gemini.google.com/app'},{id:'qwen',name:'Qwen',url:'https://chat.qwen.ai/'},{id:'kimi',name:'Kimi',url:'https://www.kimi.com/'},{id:'doubao',name:'豆包',url:'https://www.doubao.com/chat/'}];
let socket,endpoint='',retry,polling=false,job=null,current={provider:'chatgpt',sessionId:'default'},bindings={},sessionProviders={},lastHistory='',status='等待客户端连接';
const key=()=>current.provider+':'+current.sessionId;
const state=()=>({providers,...current,transport:'extension',busy:!!job,status,url:bindings[key()]?.url||'',replyMode:'mcp',requestId:job?.requestId});
function send(message){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message))}
const event=(type,data)=>send({type:'event',event:{type,data}});
const changed=()=>event('webchat.state',state());
const save=()=>chrome.storage.local.set({bindings,endpoint,current,sessionProviders});
async function tab(){const binding=bindings[key()];if(!binding)throw new Error('请先打开这个客户端会话对应的 AI 网页');try{return await chrome.tabs.get(binding.tabId)}catch{const found=(await chrome.tabs.query({})).find(t=>t.url===binding.url);if(found){binding.tabId=found.id;await save();return found}throw new Error('对应网页已关闭，请点击打开网页恢复原对话')}}
async function inspect(operation='inspect',text){const target=await tab();const result=await chrome.tabs.sendMessage(target.id,{type:'nexus.webchat',data:{operation,text,provider:current.provider}});if(!result?.ok)throw new Error(result?.error||'网页插件未就绪，请刷新 AI 网页或完成登录');return result.value}
async function open(data){
 if(job)throw new Error('请先等待当前回复结束');
 const provider=data.provider||current.provider,sessionId=data.sessionId||current.sessionId;const definition=providers.find(p=>p.id===provider);if(!definition)throw new Error('网站无效');
 current={provider,sessionId};sessionProviders[sessionId]=provider;lastHistory='';const binding=bindings[key()];let page;
 if(binding){try{page=await chrome.tabs.get(binding.tabId)}catch{page=(await chrome.tabs.query({})).find(t=>t.url===binding.url)}}
 if(!page){page=await chrome.tabs.create({url:binding?.url||definition.url,active:true});bindings[key()]={tabId:page.id,url:page.url||binding?.url||definition.url};}
 else if(data.foreground!==false){await chrome.tabs.update(page.id,{active:true});await chrome.windows.update(page.windowId,{focused:true})}
 status='网页已打开，请完成登录';await save();changed();return state();
}
async function command(operation,data={}){
 if(operation==='state')return state();
 if(operation==='activate'){if(job&&data.sessionId!==current.sessionId)throw new Error('当前会话仍在生成');if(data.sessionId!==current.sessionId){current.sessionId=data.sessionId;current.provider=sessionProviders[data.sessionId]||current.provider;lastHistory='';status=bindings[key()]?'已选择原网页对话':'新会话，请打开 AI 网页';await save();changed()}return state()}
 if(operation==='open')return open(data);
 if(operation==='reply.received'){if(job&&job.requestId===data.requestId){job=null;status='MCP 回复已接收';event('agent.status',{phase:'idle'});changed()}return {ok:true}}
 if(operation==='send'){
  if(job)throw new Error('网页仍在生成上一条回复');if(typeof data.text!=='string'||!data.text.trim())throw new Error('消息不能为空');if(data.attachments?.length)throw new Error('请先在网页上传附件');
  if(data.sessionId!==current.sessionId)await command('activate',{sessionId:data.sessionId});
  if(!data.requestId||data.replyVia!=='mcp')throw new Error('请更新客户端，消息必须带有 MCP 回复请求标识');
  const before=await inspect('status');if(before.busy)throw new Error('网页还在生成回复，请等待');if(!before.ready)throw new Error('请先完成网页登录');
  let prompt=data.text;if(data.goal)prompt='当前任务目标：'+String(data.goal).slice(0,10000)+'\n\n'+prompt;if(data.planning)prompt='请先给出计划，等待确认后执行。\n\n'+prompt;
  prompt+='\n\n【NexusMCP 客户端回复路由】\n'+JSON.stringify({requestId:data.requestId,sessionId:data.sessionId})+'\n请使用当前对话已启用的 NexusMCP 工具完成任务。请调用 client_reply，requestId/sessionId 使用上述原值，text 填给用户看的回答，done=true。回复必须回传软件，不能只在网页正文回答。需要分段可 done=false，最后一次 done=true；不知道工具时先 client_session。';
  job={requestId:data.requestId,started:Date.now(),sending:true};status='正在发送指令，回复将通过 MCP 回传';changed();event('agent.status',{phase:'executing'});
  try{await inspect('send',prompt);if(job)job.sending=false;status='等待 GPT 通过 MCP 回复';changed()}catch(e){job=null;changed();event('agent.status',{phase:'idle'});throw e}return {sent:true,replyMode:'mcp',requestId:data.requestId};
 }
 if(operation==='stop'){if(job){const result=await inspect('stop');if(!result.stopped&&result.busy)throw new Error('网页未停止，请在浏览器中手动停止');job=null;event('agent.status',{phase:'idle'});changed()}return {ok:true}}
 throw new Error('普通浏览器模式请直接在浏览器内导航和刷新');
}
async function poll(){
 if(polling||!socket||socket.readyState!==1||!bindings[key()])return;polling=true;
 try{
  const startedKey=key(),snapshot=await inspect('status');if(startedKey!==key())return;
  const binding=bindings[key()];if(binding.url!==snapshot.url){binding.url=snapshot.url;await save()}
  status=job?(Date.now()-job.started>120000?'仍在等待 MCP 回复，请确认 GPT 已启用 client_reply 工具':'等待 GPT 通过 MCP 回复'):(snapshot.ready?'网页已就绪，回复通道为 MCP':'请完成网页登录');changed();
 }catch(e){status=e.message;changed()}finally{polling=false}
}
async function connect(url){if(!/^ws:\/\/127\.0\.0\.1:\d+\/webchat\/extension\/[a-f0-9]{64}$/.test(url))throw new Error('请粘贴客户端提供的完整本机连接地址');endpoint=url;clearTimeout(retry);if(socket){socket.onclose=null;socket.close()}socket=new WebSocket(endpoint);socket.onopen=()=>{status='浏览器扩展已连接';changed();save()};socket.onmessage=async e=>{try{const m=JSON.parse(e.data);if(!m.id)return;try{const result=await command(m.operation,m.data);send({type:'result',id:m.id,result})}catch(error){send({type:'result',id:m.id,error:error.message})}}catch{}};socket.onclose=()=>{status='客户端未连接，正在重试';retry=setTimeout(()=>connect(endpoint).catch(()=>{}),3000)};socket.onerror=()=>{};await save();return {connecting:true}}
chrome.runtime.onMessage.addListener((message,_sender,respond)=>{if(message.type==='nexus.connect'){connect(message.url).then(respond,e=>respond({error:e.message}));return true}if(message.type==='nexus.disconnect'){
 if(job){respond({error:'当前会话仍在等待回复，请先在客户端停止任务。'});return}
 clearTimeout(retry);endpoint='';if(socket){socket.onclose=null;socket.close();socket=undefined}status='已断开客户端连接';save().then(()=>respond({ok:true}),e=>respond({error:e.message}));return true
 }if(message.type==='nexus.focus-bound'){tab().then(async target=>{await chrome.tabs.update(target.id,{active:true});await chrome.windows.update(target.windowId,{focused:true});respond({ok:true})},e=>respond({error:e.message})).catch(e=>respond({error:e.message}));return true
 }if(message.type==='nexus.status'){respond({connected:socket?.readyState===1,connecting:socket?.readyState===0,endpoint,...state()})}});
chrome.tabs.onUpdated.addListener((id,change)=>{if(!change.url)return;for(const b of Object.values(bindings))if(b.tabId===id)b.url=change.url;save()});
chrome.runtime.onStartup?.addListener(async()=>{const saved=await chrome.storage.local.get(['bindings']);for(const binding of Object.values(saved.bindings||{}))binding.tabId=-1;bindings=saved.bindings||bindings;await save()});
setInterval(poll,700);setInterval(()=>send({type:'ping'}),20000);
chrome.storage.local.get(['bindings','endpoint','current','sessionProviders']).then(saved=>{bindings=saved.bindings||{};sessionProviders=saved.sessionProviders||{};current=saved.current||current;endpoint=saved.endpoint||'';if(endpoint)connect(endpoint).catch(()=>{})});
