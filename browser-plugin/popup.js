const element=id=>document.getElementById(id);
const names={chatgpt:'ChatGPT',claude:'Claude',deepseek:'DeepSeek',gemini:'Gemini',qwen:'Qwen',kimi:'Kimi',doubao:'豆包'};
let tab,ready=false,pageBusy=false,sending=false,checking=false,connecting=false;
function controls(){
 element('send').disabled=!ready||pageBusy||sending||!element('text').value.trim();
 element('stop').disabled=!pageBusy||sending;
 element('send').textContent=sending?'正在发送…':'发送到当前网页';
}
async function clientStatus(){
 try{
  const state=await chrome.runtime.sendMessage({type:'nexus.status'});
  if(!state)throw new Error('无法读取软件连接状态。');
  if(!element('endpoint').value&&state.endpoint)element('endpoint').value=state.endpoint;
  element('connection').dataset.connected=String(!!state.connected);
  element('connection').textContent=state.connected?'软件已连接':connecting?'正在连接…':'软件未连接';
  element('provider').textContent=state.connected?names[state.provider]||'AI 网页':'';
  element('binding').textContent=!state.connected?'先从软件的 AI 浏览器面板复制扩展连接地址，在上方粘贴并连接。':state.url?'软件当前聊天已绑定网页，可在软件中打开原网页继续。':'当前聊天尚未绑定网页。请回到软件，点击“为当前聊天打开网页”。';
  if(state.connected)connecting=false;
 }catch(e){
  element('connection').dataset.connected='false';
  element('connection').textContent='软件未连接';
  element('binding').textContent=e.message;
 }
}
async function command(data){
 if(!tab?.id)throw new Error('请先打开 AI 网页。');
 const result=await chrome.tabs.sendMessage(tab.id,{type:'nexus.webchat',data});
 if(!result?.ok)throw new Error(result?.error||'当前网页不支持扩展，请打开 AI 网站并刷新网页。');
 return result.value;
}
async function refreshPage(){
 try{
  [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  const value=await command({operation:'inspect'});
  ready=!!value.ready;pageBusy=!!value.busy;
  element('reply').textContent=value.reply||'';
  element('state').textContent=pageBusy?'当前网页正在生成回复':ready?'当前网页可用':'请先在当前网页完成登录。';
 }catch(e){ready=false;pageBusy=false;element('state').textContent=e.message;}
 controls();
}
async function refresh(){
 if(checking)return;checking=true;
 try{await Promise.all([clientStatus(),refreshPage()]);}finally{checking=false;}
}
element('connection-form').onsubmit=async event=>{
 event.preventDefault();element('notice').textContent='';element('connect').disabled=true;
 try{
  const result=await chrome.runtime.sendMessage({type:'nexus.connect',url:element('endpoint').value.trim()});
  if(result?.error)throw new Error(result.error);
  connecting=true;element('connection').textContent='正在连接…';await clientStatus();
 }catch(e){connecting=false;element('notice').textContent=e.message;}
 finally{element('connect').disabled=false;}
};
element('text').addEventListener('input',controls);
element('send').onclick=async()=>{
 if(element('send').disabled)return;
 sending=true;controls();element('notice').textContent='';
 try{await command({operation:'send',text:element('text').value.trim()});element('text').value='';await refreshPage();}
 catch(e){element('notice').textContent=e.message;}
 finally{sending=false;controls();}
};
element('stop').onclick=async()=>{
 element('notice').textContent='';element('stop').disabled=true;
 try{const result=await command({operation:'stop'});if(result?.busy&&!result?.stopped)throw new Error('网页未停止，请在网页中手动停止。');await refreshPage();}
 catch(e){element('notice').textContent=e.message;}
};
void refresh();setInterval(refresh,1500);
