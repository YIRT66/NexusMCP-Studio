import {useCallback,useEffect,useState} from 'react';
import {useStudio} from './store';
import {request} from './connection';
import type {WebchatState} from './types';

export interface BrowserBridge {url:string;connected:boolean;transport:'embedded'|'extension'}
export interface BrowserLink {
  external:boolean;runtimeConnected:boolean;extensionConnected:boolean|null;
  verification:NonNullable<WebchatState['verification']>;verify:()=>Promise<void>;bound:boolean;needsLogin:boolean;busy:boolean;canSend:boolean;
  label:string;detail:string;bridgeURL:string;refresh:()=>Promise<void>;
}
export function applyWebchatState(state:Partial<WebchatState>|undefined){
  if(!state?.provider)return;
  const active=useStudio.getState();
  active.set({webchat:{...active.webchat,...state,ready:state.ready},...(typeof state.busy==='boolean'?{phase:state.busy?'executing':'idle'}:{})});
}
export function useBrowserLink(sessionId:string):BrowserLink {
  const connected=useStudio(s=>s.connected),webchat=useStudio(s=>s.webchat);
  const[bridge,setBridge]=useState<BrowserBridge|null>(null);
  const external=webchat.transport==='extension';
  const refresh=useCallback(async()=>{
    if(!connected||!external)return;
    try{setBridge(await request<BrowserBridge>('/webchat/bridge'));}catch{setBridge(null);}
  },[connected,external]);
  useEffect(()=>{
    if(!connected||!external){setBridge(null);return;}
    let active=true;
    const check=async()=>{try{const next=await request<BrowserBridge>('/webchat/bridge');if(active)setBridge(next);}catch{if(active)setBridge(null);}};
    void check();const timer=setInterval(()=>void check(),3000);window.addEventListener('focus',check);
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',check);};
  },[connected,external]);
  useEffect(()=>{void refresh();},[webchat.sessionId,webchat.url,webchat.status,refresh]);
  const verification=webchat.verification||{phase:'idle',step:0,error:''};
  const verify=useCallback(async()=>{await request('/webchat/verify',{});},[]);
  const extensionConnected=external?bridge?.connected??null:null;
  const bound=!!webchat.url&&(!webchat.sessionId||webchat.sessionId===sessionId);
  const needsLogin=webchat.ready===false||/请.{0,8}(完成)?登录|未登录/.test(webchat.status);
  const webpageProblem=/网页已关闭|网页插件未就绪|不支持|超时|未停止|已退出|无法连接/.test(webchat.status);
  const ready=!external||webchat.ready===true||/网页已就绪|网页正在生成回复|MCP 回复已接收|网页回复已同步/.test(webchat.status);
  let label='网页未绑定',detail='为当前聊天打开对应的 AI 网页，再开始发送消息。';
  if(!connected){label='客户端未连接';detail='连接本地运行时后，可使用浏览器聊天。';}
  else if(external&&extensionConnected===false){label='浏览器扩展未连接';detail='复制连接地址，在 Edge / Chrome 扩展中连接客户端。';}
  else if(external&&extensionConnected===null){label='正在检查扩展';detail='正在确认浏览器扩展的连接状态。';}
  else if(bound&&webchat.busy){label=webchat.replyMode==='mcp'?webchat.status:'AI 正在回复';detail=webchat.replyMode==='mcp'?'正在接收本轮回复；网页生成结束后会自动确认，MCP 回传可优先同步。':'当前聊天正在接收网页回复。';}
  else if(bound&&webchat.pageBusy){label='等待网页结束生成';detail='回复已回传，网页仍在生成。可以等待或点击停止后继续发送。';}
  else if(bound&&needsLogin){label='请完成网页登录';detail=webchat.status||'请在浏览器中完成登录，再回到这里发送消息。';}
  else if(bound&&webpageProblem){label='网页需要处理';detail=webchat.status;}
  else if(bound&&!ready){label='正在检查当前网页';detail='正在确认当前聊天对应的网页是否可用。';}
  else if(bound){label='可以开始聊天';detail='会继续使用这条聊天对应的网页对话。';}
  if(bound&&ready&&!webchat.busy&&!webchat.pageBusy&&!needsLogin&&verification.phase!=='connected'){label=verification.phase==='checking'?'正在运行对话自检':verification.phase==='error'?'连接自检未通过':'等待连接自检';detail=verification.error||'完成实际收发测试后，才会显示连接完成。';}
  return {verification,verify,external,runtimeConnected:connected,extensionConnected,bound,needsLogin,busy:webchat.busy||!!webchat.pageBusy,
    canSend:verification.phase==='connected'&&connected&&(!external||extensionConnected===true)&&bound&&ready&&!needsLogin&&!webpageProblem&&!webchat.busy&&!webchat.pageBusy,
    label,detail,bridgeURL:bridge?.url||'',refresh};
}
