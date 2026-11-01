import {useEffect,useState} from 'react';
import {Box,ExternalLink,LoaderCircle,Package,Plus,Square,Trash2} from 'lucide-react';
import {useStudio} from '../store';
import {request} from '../connection';
import type {DshState} from '../types';
import '../dsh-panel.css';
interface NativePlugin {name:string;version:string;enabled:boolean}
export function DshPanel(){
 const{connected,dsh,remote}=useStudio(),[plugins,setPlugins]=useState<NativePlugin[]>([]),[spec,setSpec]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState(false);
 const busy=pending||['installing','starting','stopping'].includes(dsh.phase);
 useEffect(()=>{if(!connected||!dsh.installed)return;let active=true;const refresh=()=>void request<NativePlugin[]>('/dsh/plugins').then(result=>{if(active)setPlugins(result);}).catch(()=>{});refresh();const timer=setInterval(refresh,3000);return()=>{active=false;clearInterval(timer);};},[connected,dsh.installed,dsh.phase]);
 async function open(){setPending(true);setError('');const tab=!window.nexusDesktop?window.open('about:blank','_blank'):null;if(tab)tab.opener=null;try{const state=dsh.running?dsh:await request<DshState>('/dsh/start',{});if(window.nexusDesktop?.openDsh)await window.nexusDesktop.openDsh();else if(tab)tab.location.href=state.url;else throw new Error('浏览器拦截了新窗口，请允许打开工作台。');}catch(error){tab?.close();setError((error as Error).message);}finally{setPending(false);}}
 async function change(action:'add'|'remove',value=spec){setPending(true);setError('');try{await request('/dsh/plugins',{action,spec:value});if(action==='add')setSpec('');}catch(error){setError((error as Error).message);}finally{setPending(false);}}
 if(remote)return <section className="dsh-panel"><h2>DSH 原生工作台</h2><p className="settings-description">原生工作台由设备持有人在本机启动和管理。公网远控页面支持当前会话的 MCP 与 API 模型。</p></section>;
 return <section className="dsh-panel"><div className="dsh-panel-heading"><Box size={23}/><div><h2>DeepSeek Harness 原生插件</h2><p>官方兼容运行时 · {dsh.version}</p></div><span className={'dsh-status '+(dsh.running?'online':'')}>{dsh.running?'运行中':dsh.phase==='installing'?'安装中':dsh.installed?'已安装':'按需安装'}</span></div>
 <p className="dsh-description">原生 DSH 插件在兼容工作台中运行，保留它们的工具、设置和界面。MCP 与 SKILL.md 扩展可从其他分类直接接入当前会话。</p>
 <div className="dsh-engine-actions">{!dsh.installed?<button className="extension-install-button" disabled={!connected||busy} onClick={()=>{setError('');void request('/dsh/install',{}).catch(error=>setError(error.message));}}>{busy?<LoaderCircle size={14} className="spin"/>:<Package size={14}/>}安装官方兼容引擎</button>:<><button className="extension-install-button" disabled={!connected||busy} onClick={()=>void open()}>{pending?<LoaderCircle size={14} className="spin"/>:<ExternalLink size={14}/>}打开 DSH 工作台</button>{dsh.running&&<button className="shell-outline-button" disabled={busy} onClick={()=>void request('/dsh/stop',{}).catch(error=>setError(error.message))}><Square size={12}/>停止工作台</button>}</>}</div>
 {!dsh.installed&&<p className="settings-caption">首次使用会下载官方运行时与依赖，需要 Node.js 24.9+。桌面新版自带所需运行时。</p>}
 {dsh.progress&&<p className="dsh-progress" role="status"><LoaderCircle size={12} className="spin"/>{dsh.progress}</p>}
 {(error||dsh.error)&&<p className="settings-error" role="alert">{error||dsh.error}</p>}
 {dsh.installed&&<div className="dsh-install"><h3>添加原生插件</h3><p>支持 npm 包、Git 地址或 <code>file:/绝对路径</code>。安装后会重启 DSH 工作台；插件需匹配上方引擎版本。</p><label className="settings-field">插件来源<input value={spec} disabled={busy} onChange={event=>setSpec(event.target.value)} placeholder="@scope/dsh-plugin 或 Git 仓库地址"/></label><button className="shell-outline-button" disabled={!connected||busy||!spec.trim()} onClick={()=>void change('add')}><Plus size={14}/>安装原生插件</button></div>}
 <div className="dsh-native-list">{plugins.map(plugin=><article key={plugin.name}><Package size={18}/><div><strong>{plugin.name}</strong><small>{plugin.enabled?'已启用':'已安装'} · {plugin.version}</small></div><button aria-label={'移除原生插件 '+plugin.name} disabled={busy} onClick={()=>void change('remove',plugin.name)}><Trash2 size={14}/></button></article>)}</div>
 </section>;
}
