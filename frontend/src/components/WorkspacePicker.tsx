import {useEffect,useRef,useState} from 'react';
import {ArrowUp,Folder,LoaderCircle} from 'lucide-react';
import {SessionDialog} from './SessionDialog';
import {request} from '../connection';
import {useSessionUI} from '../session-ui';
import type {FileEntry} from '../types';
export function WorkspacePicker({onClose}:{onClose:()=>void}){
 const[path,setPath]=useState(''),[entries,setEntries]=useState<FileEntry[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const requestSequence=useRef(0);
 async function load(target=''){const sequence=++requestSequence.current;setBusy(true);setError('');try{const result=await request<{path:string;entries:FileEntry[]}>('/fs/list?path='+encodeURIComponent(target));if(sequence!==requestSequence.current)return;setPath(result.path);setEntries(result.entries.filter(e=>e.directory));}catch(error){if(sequence===requestSequence.current)setError((error as Error).message);}finally{if(sequence===requestSequence.current)setBusy(false);}}
 useEffect(()=>{void load();},[]);
 return <SessionDialog title="选择项目文件夹" onClose={onClose} footer={<><button className="shell-outline-button" onClick={onClose}>取消</button><button className="extension-install-button" disabled={busy||!path||!!error} onClick={()=>{setBusy(true);void request<{path:string}>('/fs/list?path='+encodeURIComponent(path)).then(result=>{useSessionUI.getState().addWorkspace(result.path);onClose();}).catch(error=>setError(error.message)).finally(()=>setBusy(false));}}>打开此项目</button></>}><div className="workspace-picker-path"><input aria-label="项目文件夹路径" value={path} onChange={event=>{requestSequence.current++;setBusy(false);setPath(event.target.value);setError('');}} onKeyDown={event=>{if(event.key==='Enter')void load(path);}}/><button aria-label="项目上级目录" onClick={()=>void load(path.replace(/[\\/]+[^\\/]+[\\/]?$/,''))}><ArrowUp size={15}/></button><button onClick={()=>void load(path)}>前往</button></div>{error&&<p role="alert">{error}</p>}<div className="workspace-picker-list">{busy?<LoaderCircle className="spin"/>:entries.map(entry=><button key={entry.path} onClick={()=>void load(entry.path)}><Folder size={16}/>{entry.name}</button>)}</div></SessionDialog>;
}
