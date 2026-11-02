import {useCallback,useEffect,useRef,useState} from 'react';
import {AnimatePresence,motion,useReducedMotion} from 'framer-motion';
import {createPortal} from 'react-dom';
import {DshPanel} from './DshPanel';
import {UISelect} from './UISelect';
import {BookOpen,Check,ChevronDown,Download,FolderOpen,GitBranch,Link,LoaderCircle,Package,Plus,Puzzle,RefreshCw,Search,Trash2,X} from 'lucide-react';
import {request} from '../connection';
import {useStudio} from '../store';
import {extensionsApi,type ExtensionEntry,type ExtensionKind,type InstallExtension} from '../extensions';

const names={plugin:'插件',skill:'技能',mcp:'MCP'};
const ease=[0.22,1,0.36,1] as const;
function errorText(error:unknown){const message=error instanceof Error?error.message:String(error);return /404|Cannot (GET|POST|PATCH|DELETE)/i.test(message)?'本地运行时尚未提供扩展管理接口。':message;}
export function ExtensionManager({renderBuiltins}:{renderBuiltins:()=>React.ReactNode}){
  const connected=useStudio(s=>s.connected);
  const [items,setItems]=useState<ExtensionEntry[]>([]);
  const [filter,setFilter]=useState<'all'|ExtensionKind|'builtin'|'dsh'>('all');
  const [query,setQuery]=useState('');
  const [installing,setInstalling]=useState(false);
  const [loading,setLoading]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [error,setError]=useState('');
  const [pending,setPending]=useState<string|null>(null);
  const reduced=useReducedMotion();
  const reload=useCallback(async()=>{
    if(!connected)return;
    setLoading(true);setError('');
    try{setItems(await extensionsApi.list());setLoaded(true);}catch(e){setError(errorText(e));}finally{setLoading(false);}
  },[connected]);
  useEffect(()=>{void reload();},[reload]);
  useEffect(()=>{if(!connected||!items.some(item=>item.status==='installing'))return;const timer=setInterval(()=>void reload(),2000);return()=>clearInterval(timer);},[items,connected,reload]);
  const filtered=items.filter(item=>(filter==='all'||item.kind===filter)&&`${item.name} ${item.description||''}`.toLowerCase().includes(query.toLowerCase()));
  async function toggle(item:ExtensionEntry){
    setPending(item.id);setError('');
    try{await extensionsApi.enable(item.id,!item.enabled);await reload();}catch(e){setError(errorText(e));}finally{setPending(null);}
  }
  async function remove(item:ExtensionEntry){
    setPending(item.id);setError('');
    try{await extensionsApi.remove(item.id);await reload();}catch(e){setError(errorText(e));}finally{setPending(null);}
  }
  return <section className="extensions-page">
    <div className="shell-section-heading"><h1>插件</h1><button className="extension-install-button" onClick={()=>setInstalling(true)}><Plus size={14}/>安装插件或技能</button></div>
    <p className="extensions-intro">工具、工作方法，以及可改变界面和运行时的全权 Studio 扩展。</p><button className="shell-outline-button" disabled={!connected} onClick={()=>{void request('/extensions/example',{}).then(()=>reload()).catch(error=>setError(error.message));}}>安装启动动画 / 桌宠示例</button><button className="shell-outline-button" disabled={!connected} onClick={()=>{void request('/extensions/auto-install',{enabled:!useStudio.getState().settings.autoInstallPlugins}).then(()=>reload()).catch(error=>setError(error.message));}}>{useStudio.getState().settings.autoInstallPlugins?'关闭启动自动安装':'自动安装推荐插件'}</button>
    <div className="extension-toolbar"><nav aria-label="扩展类型">{([{id:'all',label:'全部'},{id:'plugin',label:'插件'},{id:'skill',label:'技能'},{id:'mcp',label:'MCP'},{id:'dsh',label:'DSH 原生'},{id:'builtin',label:'内置工具'}] as const).map(tab=><button key={tab.id} className={filter===tab.id?'active':''} aria-pressed={filter===tab.id} onClick={()=>setFilter(tab.id)}>{tab.label}{tab.id==='all'&&items.length>0&&<span>{items.length}</span>}</button>)}</nav><button className="extension-refresh" title="刷新扩展列表" aria-label="刷新扩展列表" disabled={!connected||loading} onClick={()=>void reload()}><RefreshCw size={14} className={loading?'spin':''}/></button></div>
    {filter==='builtin'?renderBuiltins():filter==='dsh'?<DshPanel/>:<>
      <label className="shell-search"><Search size={15}/><input aria-label="搜索插件和技能" placeholder="搜索插件和技能" value={query} onChange={event=>setQuery(event.target.value)}/></label>
      {error&&<p className="extension-error" role="alert">{error}<button onClick={()=>void reload()} disabled={loading}>重试</button></p>}
      {loading&&!loaded?<div className="extension-skeletons" aria-label="正在读取扩展列表">{[0,1,2].map(item=><div key={item}><i/><span/><b/></div>)}</div>:filtered.length?<div className="extension-list">{filtered.map(item=>{
        const Icon=item.kind==='skill'?BookOpen:item.kind==='mcp'?Link:Puzzle;
        return <article key={item.id} className="extension-row"><span className="extension-icon"><Icon size={21} strokeWidth={1.6}/></span><div className="extension-info"><div><h2>{item.name}</h2><span>{item.studio?'Studio · 全权':names[item.kind]}</span>{item.version&&<small>v{item.version.replace(/^v/,'')}</small>}</div><p>{item.description||item.source||'自定义扩展'}</p>{item.status==='installing'&&<small className="extension-installing"><LoaderCircle size={12} className="spin"/>正在安装</small>}{item.status==='error'&&<small className="settings-error">{item.error||'扩展加载失败'}</small>}</div><button className={'settings-switch '+(item.enabled?'on':'')} role="switch" aria-label={`启用 ${item.name}`} aria-checked={item.enabled} disabled={!connected||pending===item.id||item.status==='installing'} onClick={()=>void toggle(item)}><span/></button><button className="extension-remove" title={`移除 ${item.name}`} aria-label={`移除 ${item.name}`} disabled={!connected||pending===item.id||item.status==='installing'} onClick={()=>void remove(item)}>{pending===item.id?<LoaderCircle size={15} className="spin"/>:<Trash2 size={15}/>}</button></article>;
      })}</div>:<div className="extension-empty"><div className="extension-empty-icons"><Puzzle size={27} strokeWidth={1.4}/><span><BookOpen size={16} strokeWidth={1.5}/></span></div><h2>{query?'没有找到匹配的扩展':filter==='skill'?'添加你的第一个技能':'让工作空间多一种能力'}</h2><p>{query?'试试其他名称或关键词。':'从本地文件、Git 仓库或包管理器安装，\n也可以连接自己的 MCP 服务。'}</p>{!query&&<button className="shell-outline-button" onClick={()=>setInstalling(true)}><Plus size={14}/>安装插件或技能</button>}</div>}
      <p className="extensions-footnote">{connected?'安装与运行由本地服务处理。':'连接本地运行时后，可安装、启用和管理扩展。'}</p>
    </>}
    {createPortal(<AnimatePresence>{installing&&<ExtensionInstaller connected={connected} onClose={()=>setInstalling(false)} onInstalled={()=>{setInstalling(false);void reload();}} reduced={!!reduced}/>}</AnimatePresence>,document.body)}
  </section>;
}

function ExtensionInstaller({connected,onClose,onInstalled,reduced}:{connected:boolean;onClose:()=>void;onInstalled:()=>void;reduced:boolean}){
  const [kind,setKind]=useState<ExtensionKind>('plugin');
  const [source,setSource]=useState<'local'|'git'|'registry'>('local');
  const [value,setValue]=useState('');
  const [name,setName]=useState('');
  const [busy,setBusy]=useState(false);
  const [picking,setPicking]=useState(false);
  const [error,setError]=useState('');
  const root=useRef<HTMLDivElement>(null);
  const upload=useRef<HTMLInputElement>(null);const[file,setFile]=useState<File|null>(null);
  const tween={type:'tween' as const,duration:reduced?0:0.22,ease};
  useEffect(()=>{const previous=document.activeElement as HTMLElement;const layout=document.querySelector<HTMLElement>('.shell-layout');const wasInert=layout?.inert;if(layout)layout.inert=true;root.current?.querySelector<HTMLButtonElement>('[aria-label="关闭安装窗口"]')?.focus();return()=>{if(layout)layout.inert=!!wasInert;if(previous?.isConnected)previous.focus();};},[]);
  async function choose(directory:boolean){
    setPicking(true);setError('');
    try{if(!window.nexusDesktop?.selectExtensionPath){upload.current?.click();return;}const selected=await window.nexusDesktop.selectExtensionPath(directory);if(selected){setFile(null);setValue(selected);}}catch(e){setError(errorText(e));}finally{setPicking(false);}
  }
  async function install(){
    const raw=value.trim();setError('');
    if(!raw)return;
    const type=kind==='mcp'?'mcp':source;
    if(type==='mcp'){try{const parsed=new URL(raw);if(!['http:','https:'].includes(parsed.protocol))throw new Error();}catch{setError('请输入完整的 HTTP 或 HTTPS MCP 服务地址。');return;}}
    if(type==='git'&&!/^(https?:\/\/|ssh:\/\/|git@)/.test(raw)){setError('请输入 Git 仓库的 HTTPS 或 SSH 地址。');return;}
    const body:InstallExtension={kind,name:name.trim()||undefined,source:{type,value:raw}};
    setBusy(true);
    try{if(file&&source==='local'&&kind!=='mcp'){const response=await fetch('/api/extensions/upload?'+new URLSearchParams({filename:file.name,kind,name:name.trim()}),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});const result=await response.json();if(!response.ok)throw new Error(result.error||'上传失败');}else await extensionsApi.install(body);onInstalled();}catch(e){setError(errorText(e));}finally{setBusy(false);}
  }
  return <motion.div className="extension-install-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={tween} onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}><motion.div ref={root} role="dialog" aria-modal="true" aria-label="安装插件或技能" className="extension-install-dialog" initial={{opacity:0,y:reduced?0:12,scale:reduced?1:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:reduced?0:7,scale:reduced?1:.985}} transition={tween} onKeyDown={event=>{
    if((event.ctrlKey||event.metaKey)&&event.key===','){event.preventDefault();event.stopPropagation();return;}
    if(event.key==='Escape'){event.stopPropagation();if(!busy)onClose();}
    if(event.key!=='Tab')return;const elements=root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)');if(!elements?.length)return;const first=elements[0],last=elements[elements.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }}>
    <header><div><h2>安装插件或技能</h2><p>按自己的工作方式扩展应用。</p></div><button aria-label="关闭安装窗口" disabled={busy} onClick={onClose}><X size={18}/></button></header>
    <div className="extension-installer-content"><div className="extension-kind-picker" aria-label="安装类型">{([{kind:'plugin',icon:Puzzle,title:'插件',detail:'扩展工具能力'},{kind:'skill',icon:BookOpen,title:'技能',detail:'添加工作方法'},{kind:'mcp',icon:Link,title:'MCP',detail:'连接外部服务'}] as const).map(entry=><button key={entry.kind} className={kind===entry.kind?'active':''} aria-pressed={kind===entry.kind} disabled={busy} onClick={()=>{setKind(entry.kind);setFile(null);setValue('');setError('');}}><entry.icon size={19}/><strong>{entry.title}</strong><small>{entry.detail}</small>{kind===entry.kind&&<Check size={11}/>}</button>)}</div>
    {kind!=='mcp'&&<div className="extension-source-label">安装来源<UISelect label="安装来源" value={source} disabled={busy} onChange={value=>{setSource(value as typeof source);setFile(null);setValue('');setError('');}} options={[{value:'local',label:'本地文件或文件夹'},{value:'git',label:'Git 仓库'},{value:'registry',label:'包管理器'}]}/></div>}
    <label className="settings-field">{kind==='mcp'?'服务地址':source==='local'?'本地路径':source==='git'?'仓库地址':'包名'}<div className="extension-source-input">{kind==='mcp'?<Link size={16}/>:source==='local'?<FolderOpen size={16}/>:source==='git'?<GitBranch size={16}/>:<Package size={16}/>}<input aria-label="扩展安装来源" value={value} disabled={busy} onChange={event=>{setFile(null);setValue(event.target.value);}} placeholder={kind==='mcp'?'https://example.com/mcp':source==='local'?(kind==='skill'?'选择 SKILL.md、技能文件夹或压缩包':'选择插件文件、文件夹或压缩包'):source==='git'?'https://github.com/owner/repository':'npm:包名 或 pypi:包名'}/></div></label>
    <input ref={upload} hidden type="file" accept=".zip,.md,.json,.mjs,.cjs,.js,.py" onChange={e=>{const next=e.target.files?.[0];if(!next)return;if(next.size>64*1024*1024){setError('文件不能超过 64 MB');return;}setFile(next);setValue(next.name);setError('');}}/>
    {kind!=='mcp'&&source==='local'&&<div className="extension-file-actions"><button className="shell-outline-button" disabled={busy||picking} onClick={()=>void choose(false)}><Download size={14}/>{window.nexusDesktop?'选择文件':'上传文件 / ZIP'}</button>{window.nexusDesktop&&<button className="shell-outline-button" disabled={busy||picking} onClick={()=>void choose(true)}><FolderOpen size={14}/>选择文件夹</button>}</div>}
    <label className="settings-field">名称 <span className="field-optional">选填</span><input value={name} disabled={busy} onChange={event=>setName(event.target.value)} placeholder="默认使用扩展自身的名称"/></label>
    <p className="extension-source-hint">{kind==='mcp'?'添加你自己的 MCP 服务地址。':kind==='skill'?'支持导入自定义技能文件、技能目录或仓库，具体格式由安装器识别。':'Studio 全权插件可修改界面、注册组件/工具及拦截运行时调用，并以当前系统权限运行后端代码。仅安装你信任的插件。'}</p>
    {!connected&&<p className="settings-offline">本地运行时未连接，连接后即可提交安装。</p>}{error&&<p className="settings-error" role="alert">{error}</p>}
    </div><footer><button className="shell-outline-button" onClick={onClose} disabled={busy}>取消</button><button className="extension-install-button" disabled={!connected||busy||!value.trim()} onClick={()=>void install()}>{busy?<LoaderCircle size={14} className="spin"/>:<Plus size={14}/>} {busy?'正在安装…':kind==='mcp'?'添加 MCP 连接':'安装'+names[kind]}</button></footer>
  </motion.div></motion.div>;
}
