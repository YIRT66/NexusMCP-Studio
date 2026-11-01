import {useState} from 'react';
import {Check,LoaderCircle,Plus,Trash2,Pencil,KeyRound} from 'lucide-react';
import {useStudio} from '../store';
import {request} from '../connection';
import type {ApiModelProfile} from '../types';
const blank={id:'',name:'',provider:'兼容接口',baseUrl:'',model:'',apiKey:''};
export function ApiModelSettings(){
 const{apiModels,connected}=useStudio();const[draft,setDraft]=useState(blank);const[busy,setBusy]=useState(false);const[error,setError]=useState('');const[saved,setSaved]=useState(false);
 const field=(key:keyof typeof blank,value:string)=>{setDraft(current=>({...current,[key]:value}));setSaved(false);};
 async function save(){setBusy(true);setError('');try{const profile=await request<ApiModelProfile>('/model-profiles',{...draft,id:draft.id||undefined});useStudio.getState().set({apiModels:[...useStudio.getState().apiModels.filter(item=>item.id!==profile.id),profile]});setDraft(blank);setSaved(true);}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
 return <section className="api-model-settings"><h3 className="settings-section-title">API 模型</h3><p className="settings-description">支持 OpenAI 兼容接口，包括 DeepSeek、OpenAI 和本地模型服务。配置后可在输入框的模型菜单中切换。</p>
 <div className="api-profile-list">{apiModels.map(profile=><div className="api-profile" key={profile.id}><KeyRound size={16}/><div><strong>{profile.name}</strong><small>{profile.model} · {profile.keyConfigured?'密钥已保存':'未设置密钥'}</small></div><button aria-label={'编辑 '+profile.name} disabled={busy} onClick={()=>{setDraft({...profile,apiKey:''});setSaved(false);}}><Pencil size={14}/></button><button aria-label={'删除 '+profile.name} disabled={busy} onClick={()=>{setBusy(true);void request('/model-profiles/'+encodeURIComponent(profile.id),undefined,'DELETE').then(()=>useStudio.getState().set({apiModels:useStudio.getState().apiModels.filter(item=>item.id!==profile.id)})).catch(error=>setError(error.message)).finally(()=>setBusy(false));}}><Trash2 size={14}/></button></div>)}</div>
 <div className="api-profile-form"><h4>{draft.id?'编辑 API 模型':'添加 API 模型'}</h4>
 <label className="settings-field">显示名称<input autoComplete="off" value={draft.name} placeholder="例如：DeepSeek V4" onChange={event=>field('name',event.target.value)}/></label>
 <label className="settings-field">服务商<input value={draft.provider} placeholder="DeepSeek / OpenAI / 本地模型" onChange={event=>field('provider',event.target.value)}/></label>
 <label className="settings-field">API 地址<input type="url" value={draft.baseUrl} placeholder="https://api.deepseek.com/v1" autoComplete="off" onChange={event=>field('baseUrl',event.target.value)}/></label>
 <label className="settings-field">模型 ID<input value={draft.model} placeholder="填写接口提供的模型 ID" autoComplete="off" onChange={event=>field('model',event.target.value)}/></label>
 <label className="settings-field">API Key<input type="password" autoComplete="new-password" value={draft.apiKey} placeholder={draft.id?'留空保留已有密钥':'本地服务可留空'} onChange={event=>field('apiKey',event.target.value)}/></label>
 <p className="settings-caption">密钥仅保存在本地服务，不发送到浏览器存储。MCP 工具的修改操作仍遵循当前审批设置。</p>
 {error&&<p className="settings-error" role="alert">{error}</p>}{saved&&<p className="api-profile-saved" role="status"><Check size={14}/>模型已保存，可从输入框选择。</p>}
 <div className="api-profile-form-actions">{draft.id&&<button className="shell-outline-button" onClick={()=>setDraft(blank)}>取消编辑</button>}<button className="settings-done" disabled={!connected||busy||!draft.model.trim()||!draft.baseUrl.trim()} onClick={()=>void save()}>{busy?<LoaderCircle size={14} className="spin"/>:<Plus size={14}/>}{busy?'正在保存…':draft.id?'保存模型':'添加模型'}</button></div></div></section>;
}
