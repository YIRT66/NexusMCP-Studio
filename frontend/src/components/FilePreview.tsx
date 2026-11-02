import {useEffect,useState} from 'react';
import {FileText,FolderOpen,LoaderCircle} from 'lucide-react';
import {WorkspacePicker} from './WorkspacePicker';
import {SessionDialog} from './SessionDialog';
import {RichReply} from './RichReply';
import {request} from '../connection';
export const previewFile=(path:string)=>window.dispatchEvent(new CustomEvent('nexus:preview',{detail:{path}}));
export async function openInExplorer(path:string){if(window.nexusDesktop?.revealPath)return window.nexusDesktop.revealPath(path);return request('/fs/open',{path});}
interface Preview{path:string;name:string;kind:'text'|'image'|'pdf'|'unsupported';text?:string;size:number;truncated?:boolean;nextLine?:number|null}
export function PreviewHost(){const[path,setPath]=useState('');const[workspace,setWorkspace]=useState(false);useEffect(()=>{const onPreview=(event:Event)=>setPath((event as CustomEvent).detail.path);const choose=()=>setWorkspace(true);window.addEventListener('nexus:preview',onPreview);window.addEventListener('nexus:choose-workspace',choose);return()=>{window.removeEventListener('nexus:preview',onPreview);window.removeEventListener('nexus:choose-workspace',choose);};},[]);return <>{path&&<FilePreview path={path} onClose={()=>setPath('')}/ >}{workspace&&<WorkspacePicker onClose={()=>setWorkspace(false)}/>}</>;}

function FilePreview({path,onClose}:{path:string;onClose:()=>void}){
 const[value,setValue]=useState<Preview>();const[error,setError]=useState('');const[loading,setLoading]=useState(true);const[view,setView]=useState<'source'|'rendered'>('rendered');
 useEffect(()=>{let active=true;setLoading(true);setError('');void request<Preview>('/fs/preview?path='+encodeURIComponent(path)).then(result=>{if(active)setValue(result);}).catch(error=>{if(active)setError(error.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[path]);
 const markdown=/\.(?:md|markdown)$/i.test(path);const content='/api/fs/content?path='+encodeURIComponent(path);
 return <SessionDialog title={'文件预览 · '+(value?.name||path.split(/[\\/]/).at(-1))} onClose={onClose} footer={<><span>{value?`${(value.size/1024).toFixed(1)} KB`:''}{value?.truncated?' · 仅显示前一部分':''}</span><button className="shell-outline-button" onClick={()=>void openInExplorer(path).catch(error=>setError(error.message))}><FolderOpen size={14}/>在资源管理器中显示</button></>}><div className="file-preview"><p className="file-preview-path">{path}</p>{loading?<LoaderCircle className="spin"/>:error?<p role="alert">{error}</p>:value?.kind==='image'?<img src={content} alt={value.name}/>:value?.kind==='pdf'?<iframe title="PDF 文件预览" src={content}/>:value?.kind==='text'?<>{markdown&&<div className="preview-tabs"><button aria-pressed={view==='rendered'} onClick={()=>setView('rendered')}>预览</button><button aria-pressed={view==='source'} onClick={()=>setView('source')}>源文件</button></div>}{markdown&&view==='rendered'?<div className="markdown"><RichReply content={value.text||''}/></div>:<pre tabIndex={0}>{value.text}</pre>}{value.truncated&&<p>文件较大，预览已按行数/容量限制。{value.nextLine?`下一行：${value.nextLine}`:''}</p>}</>:<p><FileText size={22}/>此格式可在资源管理器中打开。</p>}</div></SessionDialog>;
}
