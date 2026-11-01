import {useState} from 'react';
import {Copy,Globe,LoaderCircle,Square,ExternalLink} from 'lucide-react';
import {useStudio} from '../store';
import {request} from '../connection';
import type {PublicAccessState} from '../types';
export function PublicAccessSettings(){
 const s=useStudio(),state=s.publicAccess;const[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false);
 async function toggle(){setBusy(true);setError('');try{if(state.phase==='running'||state.phase==='starting'){const result=await request<PublicAccessState>('/public-access/stop',{});s.set({publicAccess:result});}else{await request('/public-access/start',{});}}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(s.remote)return <p className="settings-description">公网入口由设备持有人在本机管理。</p>;
 return <section className="public-access-settings"><h3 className="settings-section-title"><Globe size={18}/> 公网远控</h3><p className="settings-description">开启后生成 HTTPS 分享链接。持有链接的人可以查看桌面、操作键鼠和终端，并使用当前工作空间的功能。仅分享给你信任的人。</p>
 <div className="settings-row"><div><strong>{state.phase==='running'?'公网入口已开启':state.phase==='starting'?'正在建立公网隧道…':'公网入口已关闭'}</strong><p>{state.phase==='running'?`${state.connections} 个远程页面在线`:'使用 Cloudflare 临时隧道，软件退出后失效。'}</p></div><button className="shell-outline-button" disabled={!s.connected||busy} onClick={()=>void toggle()}>{state.phase==='starting'?<LoaderCircle size={14} className="spin"/>:state.phase==='running'?<Square size={14}/>:<Globe size={14}/>} {state.phase==='running'||state.phase==='starting'?'关闭入口':'开启公网访问'}</button></div>
 {state.url&&<div className="public-share-card"><label className="settings-field">远控分享链接<input aria-label="远控分享链接" readOnly value={state.url} onFocus={e=>e.target.select()}/></label><div className="public-share-actions"><button className="shell-outline-button" onClick={()=>void navigator.clipboard.writeText(state.url).then(()=>setCopied(true)).catch(()=>setError('复制失败，请选中链接手动复制'))}><Copy size={14}/>{copied?'已复制':'复制链接'}</button><a className="shell-outline-button" href={state.url} target="_blank" rel="noreferrer"><ExternalLink size={14}/>打开网页</a></div><p className="settings-caption">链接包含访问凭证。关闭入口会立即断开远控连接，停止该入口发起的 API 任务并关闭其终端；再次开启会生成新链接。</p></div>}
 {(error||state.error)&&<p role="alert" className="settings-error">{error||state.error}</p>}
 </section>;
}
