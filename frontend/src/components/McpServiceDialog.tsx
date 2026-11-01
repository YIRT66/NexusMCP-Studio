import {useEffect,useRef,useState} from 'react';
import {Check,Copy,Link,LoaderCircle,Plug,RefreshCw,Square} from 'lucide-react';
import {useStudio} from '../store';
import {request} from '../connection';
import type {ServiceState} from '../types';
import {SessionDialog} from './SessionDialog';
import {ensureMcpStarted} from '../mcp-service';

const statusLabels={stopped:'服务未启动',starting:'正在生成临时地址',running:'服务已启动',stopping:'正在停止服务',error:'服务启动失败'};
export function McpServiceDialog({onClose,onConnect}:{onClose:()=>void;onConnect:()=>void}){
  const {service,connected,connecting,set}=useStudio();
  const [busy,setBusy]=useState(false);const[error,setError]=useState('');const[copied,setCopied]=useState(false);const[wantStart,setWantStart]=useState(true);const started=useRef(false);
  useEffect(()=>{if(!useStudio.getState().connected)onConnect();},[]);
  async function start(){
    if(busy)return;setBusy(true);setError('');
    try{await ensureMcpStarted();}
    catch(e){setError((e as Error).message);started.current=false;setWantStart(false);}
    finally{setBusy(false);}
  }
  useEffect(()=>{if(!connected||!wantStart||started.current)return;if(['running','starting','stopping'].includes(service.phase)){started.current=true;return;}started.current=true;void start();},[connected,wantStart,service.phase]);
  useEffect(()=>{setCopied(false);},[service.url]);
  useEffect(()=>{if(!copied)return;const timer=setTimeout(()=>setCopied(false),2200);return()=>clearTimeout(timer);},[copied]);
  async function stop(){setBusy(true);setError('');setWantStart(false);try{const state=await request<ServiceState>('/service/stop',{});if(state?.phase)set({service:state});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function copy(){try{if(window.nexusDesktop?.copyText){if(!await window.nexusDesktop.copyText(service.url))throw new Error('复制失败');}else await navigator.clipboard.writeText(service.url);setCopied(true);setError('');}catch{setError('复制失败，请选中地址后按 Ctrl+C 复制。');}}
  const starting=busy||service.phase==='starting';
  const addressReady=connected&&service.phase==='running'&&!!service.url;
  function retry(){if(!connected){onConnect();setWantStart(true);started.current=false;}else{started.current=true;setWantStart(true);void start();}}
  return <SessionDialog title="MCP 服务" onClose={onClose} footer={<><button className="shell-outline-button" onClick={onClose}>完成</button>{['running','starting'].includes(service.phase)&&connected?<button className="shell-outline-button" disabled={busy||service.phase==='stopping'} onClick={()=>void stop()}><Square size={12}/>停止服务</button>:<button className="extension-install-button" disabled={busy||service.phase==='stopping'} onClick={retry}>{starting?<LoaderCircle size={13} className="spin"/>:<RefreshCw size={13}/>}重新连接</button>}</>}>
    <div className="mcp-service-heading"><span><Plug size={23} strokeWidth={1.5}/></span><div><h3>连接你的 AI</h3><p>复制 MCP 地址，在 AI 客户端中添加连接。</p></div></div>
    <div className="mcp-service-status"><span className={service.phase==='running'&&connected?'online':''}/><strong>{!connected?(connecting?'正在连接本地运行时':'本地运行时未连接'):statusLabels[service.phase]}</strong>{(starting||!connected&&connecting)&&<LoaderCircle size={13} className="spin"/>}<small>{service.localOnly?'本机调试':'临时公网连接'}</small></div>
    <label className="mcp-address-label"><span><Link size={13}/>{service.localOnly?'本机 MCP 地址':'临时 MCP 服务地址'}</span><textarea aria-label="临时 MCP 服务地址" readOnly value={service.url||''} placeholder={starting?'正在生成临时公网地址…':!connected?'等待本地运行时连接…':'启动服务后，地址会显示在这里'} onFocus={event=>event.target.select()}/></label>
    <button className={'mcp-copy-button '+(copied?'copied':'')} disabled={!addressReady} onClick={()=>void copy()}>{copied?<Check size={15}/>:<Copy size={15}/>} {copied?'已复制完整地址':'复制 MCP 地址'}</button>
    <div className="mcp-connection-guide"><h4>在 AI 中使用</h4><ol><li>打开 ChatGPT、Claude 等客户端的 MCP 连接设置。</li><li>添加自定义连接，粘贴上面的完整地址。</li><li>选择该连接，即可在对话中使用本机工具。</li></ol><p>连接所需的身份验证方式以本地服务返回的配置为准。临时地址在服务重启后可能变化，需要更新连接。</p></div>
    {(error||service.error)&&<p className="settings-error" role="alert">{error||service.error}</p>}
  </SessionDialog>;
}
