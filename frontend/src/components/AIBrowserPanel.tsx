import {useEffect,useRef,useState} from 'react';
import {motion,useIsPresent,useReducedMotion} from 'framer-motion';
import {ChevronLeft,RefreshCw,X,Globe,LoaderCircle,Copy,ExternalLink,FolderOpen,Check,Monitor,Link2} from 'lucide-react';
import {useStudio} from '../store';
import {useSessionUI} from '../session-ui';
import {request} from '../connection';
import {applyWebchatState,type BrowserLink} from '../browser-link';
import type {WebchatState} from '../types';
import {UISelect} from './UISelect';
import {AIAvatar} from './AIAvatar';
import {BrowserConsole} from './BrowserConsole';

export const aiSites=[{id:'chatgpt',name:'ChatGPT'},{id:'claude',name:'Claude'},{id:'deepseek',name:'DeepSeek'},{id:'gemini',name:'Gemini'},{id:'qwen',name:'Qwen'},{id:'kimi',name:'Kimi'},{id:'doubao',name:'豆包'}];
interface Props {
 suspended:boolean;onClose:()=>void;onConnect:()=>void;link:BrowserLink;
 opening:boolean;pageError:string;onOpenPage:(provider?:string)=>Promise<void>;
}
export function AIBrowserPanel({suspended,onClose,onConnect,link,opening,pageError,onOpenPage}:Props){
 const reduced=useReducedMotion(),present=useIsPresent();
 const[entered,setEntered]=useState(false),[viewport,setViewport]=useState(innerWidth);
 const s=useStudio(),session=useSessionUI(u=>u.sessions.find(item=>item.id===u.activeSessionId)!);
 const host=useRef<HTMLDivElement>(null);
 const[error,setError]=useState(''),[loading,setLoading]=useState(false),[url,setUrl]=useState(''),[revision,setRevision]=useState(0),[copied,setCopied]=useState(false);
 const copyTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const[consoleOpen,setConsoleOpen]=useState(false);
 const external=link.external,working=loading||opening;
 const aiName=aiSites.find(site=>site.id===s.webchat.provider)?.name||'AI';
 const panelWidth=viewport<=650?'100%':viewport<=1100?'70%':'45%';
 useEffect(()=>{const resize=()=>setViewport(innerWidth);window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
 useEffect(()=>{setUrl(s.webchat.url||'');},[s.webchat.url]);
 useEffect(()=>()=>clearTimeout(copyTimer.current),[]);
 async function command(operation:string){
  setError('');setLoading(true);
  try{await window.nexusDesktop?.webchat(operation);setRevision(n=>n+1);}
  catch(e){setError((e as Error).message);}finally{setLoading(false);}
 }
 useEffect(()=>{if(!external)void onOpenPage();},[session.id,external]);
 useEffect(()=>{
  const update=()=>{
   if(!host.current||suspended||working||error||external||!entered||!present||document.querySelector('[role="menu"],[role="listbox"],[role="dialog"]')){window.nexusDesktop?.browserBounds(null);return;}
   const r=host.current.getBoundingClientRect();window.nexusDesktop?.browserBounds({x:r.x,y:r.y,width:r.width,height:r.height});
  };
  update();const observer=new ResizeObserver(update);if(host.current)observer.observe(host.current);window.addEventListener('resize',update);const overlays=new MutationObserver(update);overlays.observe(document.body,{childList:true});
  return()=>{overlays.disconnect();observer.disconnect();window.removeEventListener('resize',update);window.nexusDesktop?.browserBounds(null);};
 },[suspended,working,error,revision,s.webchat.provider,external,entered,present,consoleOpen]);
 async function transport(value:string){
  setError('');setLoading(true);
  try{applyWebchatState(await request<WebchatState>('/webchat/transport',{transport:value}));}
  catch(e){setError((e as Error).message);}finally{setLoading(false);}
 }
 async function copyBridge(){
  setError('');
  try{
   const info=await request<{url:string}>('/webchat/bridge');
   if(window.nexusDesktop){if(!await window.nexusDesktop.copyText(info.url))throw new Error('复制失败，请重试。');}
   else await navigator.clipboard.writeText(info.url);
   setCopied(true);clearTimeout(copyTimer.current);copyTimer.current=setTimeout(()=>setCopied(false),2500);
  }catch(e){setError((e as Error).message);}
 }
 async function openPlugin(){
  setError('');
  try{if(!window.nexusDesktop)throw new Error('请在桌面软件中打开扩展文件夹。');await window.nexusDesktop.openBrowserPlugin();}
  catch(e){setError((e as Error).message);}
 }
 async function navigate(){
  setError('');setLoading(true);const sessionId=session.id;
  try{const state=await request<WebchatState>('/webchat/open',{provider:s.webchat.provider,sessionId,url});if(useSessionUI.getState().activeSessionId===sessionId)applyWebchatState(state);}
  catch(e){setError((e as Error).message);}finally{setLoading(false);}
 }
 return <motion.aside className="ai-browser-panel" aria-label="AI 浏览器面板" style={{minWidth:0}}
  initial={{opacity:0,width:viewport<=1100?panelWidth:0,x:reduced||viewport>1100?0:20}}
  animate={{opacity:1,width:panelWidth,x:0}}
  exit={{opacity:0,width:viewport<=1100?panelWidth:0,x:reduced||viewport>1100?0:20}}
  transition={{type:'tween',duration:reduced?0:.24,ease:[.22,1,.36,1]}}
  onAnimationComplete={()=>{if(present)setEntered(true);}}>
  <header className="ai-browser-header">
   <UISelect label="浏览器运行方式" className="browser-mode-select" value={external?'extension':'embedded'} options={[{value:'embedded',label:'内置浏览器',icon:<Monitor size={14}/>},{value:'extension',label:'Edge / Chrome 扩展',icon:<Globe size={14}/>}]} showSelectedIcon placement="bottom" minMenuWidth={205} disabled={!s.connected||s.webchat.busy||working} onChange={value=>void transport(value)}/>
   <UISelect label="AI 浏览器网站" className="browser-provider-select" value={s.webchat.provider} options={aiSites.map(site=>({value:site.id,label:site.name,icon:<AIAvatar provider={site.id} small decorative/>}))} showSelectedIcon placement="bottom" disabled={!s.connected||s.webchat.busy||working||(external&&link.extensionConnected!==true)} onChange={value=>{setError('');void onOpenPage(value);}}/>
   {!external&&<><button title="后退" aria-label="网页后退" disabled={working} onClick={()=>void command('back')}><ChevronLeft size={16}/></button><button title="刷新网页" aria-label="刷新 AI 网页" disabled={working} onClick={()=>void command('reload')}><RefreshCw size={14}/></button></>}
   <button aria-label="收起 AI 浏览器" title="收起 AI 浏览器" onClick={onClose}><X size={16}/></button>
  </header>
  {!external&&<form onSubmit={e=>{e.preventDefault();void navigate();}}><input aria-label="浏览器网址" value={url} placeholder="https://…" onChange={e=>setUrl(e.target.value)}/></form>}
  {(error||pageError)&&<p className="ai-browser-error" role="alert">{error||pageError}</p>}
  <div className="ai-browser-canvas" ref={host}>
   {external?<div className="browser-extension-body"><div className="browser-extension-content">
    <div className="browser-current-ai"><AIAvatar provider={s.webchat.provider} decorative/><span>{aiName}<small title={session.title}>{session.title}</small></span></div>
    <h2>{link.canSend?'可以回到软件聊天了':!link.runtimeConnected?'连接本地运行时':link.extensionConnected!==true?'连接你的浏览器':link.bound?'继续当前网页对话':'为这条聊天打开网页'}</h2>
    <p className="browser-link-description">{link.detail}</p>
    <ul className="browser-link-stages" aria-label="浏览器连接状态">
     <li data-complete={link.runtimeConnected}><span>{link.runtimeConnected?<Check size={13}/>:<Monitor size={13}/>}</span><div>本地运行时<small>{link.runtimeConnected?'已连接':'等待连接'}</small></div></li>
     <li data-complete={link.extensionConnected===true}><span>{link.extensionConnected===true?<Check size={13}/>:<Globe size={13}/>}</span><div>浏览器扩展<small>{link.extensionConnected===null?'检查中':link.extensionConnected?'已连接':'未连接'}</small></div></li>
     <li data-complete={link.bound&&link.extensionConnected===true}><span>{link.bound&&link.extensionConnected===true?<Check size={13}/>:<Link2 size={13}/>}</span><div>当前聊天网页<small>{link.bound?'已绑定'+(link.needsLogin?'，请登录':''):'尚未打开'}</small></div></li>
    </ul>
    {link.bound&&<p className="browser-bound-url" title={s.webchat.url}>{s.webchat.url}</p>}
    {link.runtimeConnected&&<div className="browser-auto-install"><button className="browser-link-primary" disabled={['preparing','downloading','launching'].includes(s.browserInstall.phase)} onClick={()=>{setError('');void request('/browser-extension/install',{sessionId:session.id,provider:s.webchat.provider}).catch(error=>setError(error.message));}}>{['preparing','downloading','launching'].includes(s.browserInstall.phase)?<LoaderCircle size={14} className="spin"/>:<Globe size={14}/>}一键安装并连接浏览器扩展</button><p>{s.browserInstall.error||s.browserInstall.progress||'自动下载兼容 Chromium、安装扩展并配对。首次完成网页登录后即可使用。'}</p>{s.settings.autoInstallBrowser&&<button className="browser-link-secondary" onClick={()=>void request('/settings',{autoInstallBrowser:false}).catch(error=>setError(error.message))}>关闭启动时自动恢复浏览器</button>}</div>}
    <div className="browser-link-primary-actions">
     {!link.runtimeConnected?<button className="browser-link-primary" onClick={onConnect}>连接运行时</button>:link.extensionConnected!==true?<button className="browser-link-primary" onClick={()=>void copyBridge()}>{copied?<Check size={14}/>:<Copy size={14}/>} {copied?'连接地址已复制':'复制扩展连接地址'}</button>:<button className="browser-link-primary" disabled={working||link.busy} onClick={()=>{setError('');void onOpenPage();}}>{opening?<LoaderCircle size={14} className="spin"/>:<ExternalLink size={14}/>} {opening?'正在打开…':link.bound?'打开原网页':'为当前聊天打开网页'}</button>}
     {link.canSend&&<button className="browser-link-secondary" onClick={onClose}>返回聊天</button>}
    </div>
    {link.runtimeConnected&&<details className="browser-extension-setup" open={link.extensionConnected!==true?true:undefined}>
     <summary>扩展安装与连接</summary>
     <ol><li><button onClick={()=>void openPlugin()}><FolderOpen size={13}/>打开扩展文件夹</button>，在 Edge / Chrome 扩展管理页开启开发者模式，选择“加载已解压的扩展程序”。</li><li><button onClick={()=>void copyBridge()}><Copy size={13}/>{copied?'已复制连接地址':'复制扩展连接地址'}</button>，粘贴到扩展弹窗并连接。</li><li>在软件中点击“为当前聊天打开网页”，完成登录后返回软件发送消息。</li></ol>
     <p>每条软件聊天使用各自绑定的网页对话。登录和验证码在浏览器中完成。</p>
    </details>}
   </div></div>:working?<span><LoaderCircle size={18} className="spin"/>正在打开网页…</span>:<span>网页在这里显示。也可切换到 Edge / Chrome 扩展。</span>}
  </div>
  {consoleOpen&&<BrowserConsole/>}
  <footer title={link.detail}><span>{link.label}</span><button aria-expanded={consoleOpen} onClick={()=>setConsoleOpen(value=>!value)}>{consoleOpen?'收起控制台':'打开控制台'}</button></footer>
 </motion.aside>;
}
