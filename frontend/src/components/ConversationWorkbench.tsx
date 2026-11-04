import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {AnimatePresence,motion,useReducedMotion} from 'framer-motion';
import {ArrowDown,ArrowUp,Check,ChevronDown,Clock,Download,File,FileText,Folder,GitBranch,ListTodo,LoaderCircle,MessageSquare,MoreHorizontal,Paperclip,Plus,Search,Send,Shield,ShieldCheck,Square,Target,X,AlertCircle} from 'lucide-react';
import {TaskControls} from './TaskControls';
import {RightPreview,openWorkbench,previewFile} from './FilePreview';
import {ReasoningActivity} from './ReasoningActivity';
import {UserQuestion} from './UserQuestion';
import {ChatMessage,ReplyPending} from './ChatMessage';
import {ModelPicker} from './ModelPicker';
import {Trajectory} from './Trajectory';
import {trajectoryRecords} from '../trajectory';
import {AIAvatar} from './AIAvatar';
import {zipSync,strToU8} from 'fflate';
import {useStudio} from '../store';
import {act,request,send} from '../connection';
import {chooseWorkspace,useSessionUI,type PermissionMode} from '../session-ui';
import {UISelect} from './UISelect';
import {SessionDialog} from './SessionDialog';
import {ExecutionGroup,groupExecutions} from './ExecutionGroup';
import type {Message,WebchatState} from '../types';
import {applyWebchatState,useBrowserLink} from '../browser-link';
import {AIBrowserPanel,aiSites} from './AIBrowserPanel';
import {PanelRight,GitCompareArrows,Brain,Search as SearchFiles} from 'lucide-react';
import {Globe} from 'lucide-react';
import '../webchat.css';

const permissions=[{value:'readonly',label:'仅可查看',icon:<ShieldCheck size={13}/>},{value:'workspace',label:'工作区内修改',icon:<FileText size={13}/>},{value:'full',label:'完全权限',icon:<Shield size={13}/>}];
const commands=[{id:'file',label:'文件',hint:'添加文件作为任务上下文',icon:Paperclip,group:'添加'},{id:'goal',label:'目标',hint:'设置或查看长期任务目标',icon:Target,group:'添加'},{id:'plan',label:'计划',hint:'进入或退出计划模式',icon:ListTodo,group:'添加'},{id:'feedback',label:'反馈',hint:'发送关于当前会话的反馈',icon:Send,group:'添加'},{id:'compact',label:'压缩',hint:'压缩当前会话上下文',icon:MessageSquare,group:'指令'},{id:'permission',label:'权限',hint:'切换权限与审批方式',icon:Shield,group:'指令'},{id:'model',label:'模型',hint:'选择当前会话使用的模型',icon:GitBranch,group:'指令'},{id:'export',label:'下载日志',hint:'将当前会话与执行记录导出为 ZIP',icon:Download,group:'指令'}];

export function ConversationWorkbench({onOpenModel,onConnect,browserSuspended=false}:{onOpenModel:()=>void;onConnect:()=>void;browserSuspended?:boolean}){
  const s=useStudio();const[browserOpen,setBrowserOpen]=useState(false);const[browserClosing,setBrowserClosing]=useState(false);const u=useSessionUI();const session=u.sessions.find(item=>item.id===u.activeSessionId)!;const workspace=u.workspaces.find(item=>item.id===u.activeWorkspaceId)!;
  const [tab,setTab]=useState<'chat'|'trace'>('chat');const[text,setText]=useState(session.draft||'');const[webFiles,setWebFiles]=useState<{name:string;text:string}[]>([]);const filePicker=useRef<HTMLInputElement>(null);const[attachments,setAttachments]=useState<string[]>([]);const[menu,setMenu]=useState(false);const[commandIndex,setCommandIndex]=useState(0);const[permissionSignal,setPermissionSignal]=useState(0);const[modelSignal,setModelSignal]=useState(0);const[dialog,setDialog]=useState<'goal'|'feedback'|'full'|null>(null);const[dialogText,setDialogText]=useState('');const[accepted,setAccepted]=useState(false);const[busy,setBusy]=useState(false);const[error,setError]=useState('');const[atBottom,setAtBottom]=useState(true);
  const input=useRef<HTMLTextAreaElement>(null);const stream=useRef<HTMLDivElement>(null);const commandRef=useRef<HTMLDivElement>(null);const plus=useRef<HTMLButtonElement>(null);const reduced=useReducedMotion();
  const followEnd=useRef(true);const composerWrap=useRef<HTMLDivElement>(null);
  const [inputHeight,setInputHeight]=useState(71);const[trajectoryModal,setTrajectoryModal]=useState(false);
  const browserLink=useBrowserLink(session.id);const[openingPage,setOpeningPage]=useState(false);
  const isApi=session.modelMode==='api';const apiProfile=s.apiModels.find(model=>model.id===session.apiProfileId);const apiState=s.apiChats[session.id];const responding=!!s.replyActivities[session.id]?.busy||(isApi?!!apiState?.busy:browserLink.busy);const canSend=isApi?s.connected&&!!apiProfile&&!responding:browserLink.canSend;
  const updateText=(value:string)=>{setText(value);u.updateSessionId(session.id,{draft:value});};
  useEffect(()=>setText(session.draft||''),[session.draft,u.activeSessionId]);
  const aiName=aiSites.find(site=>site.id===s.webchat.provider)?.name||'AI';
  useEffect(()=>{if(s.webchat.sessionId===session.id&&s.webchat.provider&&session.modelMode==='mcp')u.updateSessionId(session.id,{mcpProvider:s.webchat.provider});},[s.webchat.provider,s.webchat.sessionId,session.id]);
  useEffect(()=>{if(browserLink.bound&&!browserLink.needsLogin)setError(current=>/客户端会话对应|请先打开|请先完成网页登录/.test(current)?'':current);},[browserLink.bound,browserLink.needsLogin]);
  useEffect(()=>{if(!text)setInputHeight(71);},[text]);
  const empty=!s.messages.length&&!s.calls.length;const matching=commands.filter(command=>!text.startsWith('/')||`${command.id} ${command.label}`.toLowerCase().includes(text.slice(1).toLowerCase()));
  const showCommands=menu||text.startsWith('/');
  useEffect(()=>{setCommandIndex(0);},[text,menu]);
  useEffect(()=>{setText(session.draft||'');setAttachments([]);setWebFiles([]);setDialog(null);setError('');setTab('chat');followEnd.current=true;setAtBottom(true);},[u.activeSessionId]);
  useLayoutEffect(()=>{if(followEnd.current&&stream.current&&tab==='chat')stream.current.scrollTop=stream.current.scrollHeight;},[s.messages,s.questions,s.calls,tab]);
  useEffect(()=>{const composer=composerWrap.current;if(!composer)return;const update=()=>composer.parentElement?.style.setProperty('--composer-height',`${composer.offsetHeight}px`);update();const observer=new ResizeObserver(update);observer.observe(composer);return()=>observer.disconnect();},[tab]);
  useEffect(()=>{const content=stream.current?.firstElementChild;if(!content)return;const observer=new ResizeObserver(()=>{if(followEnd.current&&stream.current&&tab==='chat')stream.current.scrollTop=stream.current.scrollHeight;});observer.observe(content);return()=>observer.disconnect();},[tab]);
  useEffect(()=>{if(!showCommands)return;const outside=(event:PointerEvent)=>{if(!commandRef.current?.contains(event.target as Node)&&!input.current?.contains(event.target as Node)&&!plus.current?.contains(event.target as Node)){setMenu(false);if(text.startsWith('/'))updateText('');}};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[showCommands,text]);
  const entries=useMemo(()=>trajectoryRecords(s.messages,s.calls,session.timeline),[s.messages,s.questions,s.calls,session.timeline]);
  const chatEntries=useMemo(()=>groupExecutions(entries),[entries]);
  async function changePermission(permission:PermissionMode){
    setError('');
    if(!s.connected){setError('连接本地运行时后才能切换实际权限。');return;}
    if(s.connected){setBusy(true);try{const result=await request<{mode:PermissionMode}>('/permissions',{mode:permission,workspace:workspace.path,sessionId:session.id});if(result.mode!==permission)throw new Error('运行时尚未确认所选权限。');}catch(e){setError((e as Error).message);return;}finally{setBusy(false);}}
    u.updateSession({permission});setDialog(null);
  }
  async function addFiles(){if(isApi){filePicker.current?.click();return;}try{const selected=await window.nexusDesktop?.selectAttachments?.();if(!selected){setError('请使用桌面开发版添加本地文件。');return;}setAttachments(current=>[...new Set([...current,...selected])]);}catch(e){setError((e as Error).message);}}
  async function exportSession(){
    const archive=zipSync({'conversation.md':strToU8(s.messages.map(message=>`## ${message.role==='user'?'用户':'助手'}\n\n${message.content}`).join('\n\n')),'operations.json':strToU8(JSON.stringify(s.calls,null,2)),'session.json':strToU8(JSON.stringify({id:session.id,title:session.title,workspace:workspace.path,goal:session.goal,planning:session.planning,permission:session.permission,exportedAt:new Date().toISOString()},null,2))},{level:1});
    const name=`NexusMCP-${session.id.slice(0,8)}.zip`;
    if(window.nexusDesktop?.saveArchive){await window.nexusDesktop.saveArchive(archive,name);return;}
    const url=URL.createObjectURL(new Blob([archive as Uint8Array<ArrayBuffer>],{type:'application/zip'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function execute(id:string){
    setMenu(false);if(text.startsWith('/'))updateText('');setError('');
    if(id==='file')await addFiles();
    else if(id==='goal'){setDialogText(session.goal);setDialog('goal');}
    else if(id==='plan')u.updateSession({planning:!session.planning});
    else if(id==='feedback'){setDialogText('');setDialog('feedback');}
    else if(id==='permission')setPermissionSignal(value=>value+1);
    else if(id==='model')setModelSignal(value=>value+1);
    else if(id==='export'){try{await exportSession();}catch(e){setError((e as Error).message);}}
    else if(id==='compact'){
      if(!s.connected){setError('连接本地运行时后可压缩上下文。');return;}
      setBusy(true);try{const result=await request<{messages?:Message[];summary?:string}>(`/sessions/${encodeURIComponent(session.id)}/compact`,{});if(result.messages)s.set({messages:result.messages});else if(result.summary){u.updateSession({compactionSummary:result.summary});setError('上下文摘要已保存，完整历史仍在本地保留。');}else throw new Error('运行时未返回压缩结果。');}catch(e){setError((e as Error).message);}finally{setBusy(false);}
    }
    input.current?.focus();
  }
  const queuedFlight=useRef(false);
  useEffect(()=>{if(responding||busy||!canSend||session.queuePaused||!session.queue?.length||queuedFlight.current||s.questions.some(q=>q.sessionId===session.id&&q.status==='pending'))return;const item=session.queue[0],id=session.id;queuedFlight.current=true;void submit(item.text,item.id).then(sent=>{const current=useSessionUI.getState().sessions.find(s=>s.id===id);if(current)u.updateSessionId(id,sent?{queue:(current.queue||[]).filter(q=>q.id!==item.id)}:{queuePaused:true});}).finally(()=>{queuedFlight.current=false;});},[responding,busy,canSend,session.queue,session.queuePaused,s.questions]);
  function enqueue(){if(!text.trim())return;u.updateSession({queue:[...(session.queue||[]),{id:crypto.randomUUID(),text:text.trim()}],queuePaused:false});updateText('');}
  async function submit(queuedText?:string,turnId?:string){
    if(!queuedText&&responding){enqueue();return false;}
    if(!(queuedText??text).trim()||!s.connected||responding||busy)return;
    if(!canSend){setError(isApi?'请先添加并选择 API 模型。':browserLink.detail);return;}
    const content=(queuedText??text).trim(),sessionId=session.id;const clientTurnId=turnId||crypto.randomUUID();setBusy(true);setError('');
    try{
      if(isApi)await request('/chat/send',{text:content,sessionId,clientTurnId,profileId:session.apiProfileId,reasoningEffort:session.reasoningEffort||'default',planning:session.planning,goal:session.goal,permission:session.permission,workspace:workspace.path,attachments:webFiles});
      else{if(attachments.length)throw new Error('请先在对应 AI 网页上传附件。');await request('/webchat/send',{text:content,sessionId,clientTurnId,planning:session.planning,goal:session.goal,permission:session.permission,workspace:workspace.path});}
      if(queuedText)return true;
      u.updateSessionId(sessionId,{draft:''});if(useSessionUI.getState().activeSessionId===sessionId){setText('');setAttachments([]);setWebFiles([]);}return true;
    }catch(error){if(useSessionUI.getState().activeSessionId===sessionId)setError((error as Error).message);return false;}finally{setBusy(false);}
  }
  async function selectModel(mode:'mcp'|'api',id:string){u.updateSession({modelMode:mode,...(mode==='api'?{apiProfileId:id}:{mcpProvider:id})});setError('');if(mode==='mcp'&&s.connected&&(!browserLink.external||browserLink.extensionConnected))await openPage(id);}
  async function readFiles(files:FileList|null){if(!files)return;try{const next:{name:string;text:string}[]=[];for(const file of [...files]){if(file.size>200000)throw new Error('每个文本附件需小于 200 KB');const content=await file.text();if(content.includes('\0'))throw new Error('仅支持文本附件，请选择代码、Markdown、JSON 或纯文本文件');next.push({name:file.name,text:content});}setWebFiles(current=>[...current,...next]);}catch(error){setError((error as Error).message);}finally{if(filePicker.current)filePicker.current.value='';}}
  async function openPage(provider=s.webchat.provider){
    if(openingPage||s.webchat.busy)return;
    setOpeningPage(true);setError('');
    const sessionId=session.id;
    try{const state=await request<WebchatState>('/webchat/open',{provider,sessionId});if(useSessionUI.getState().activeSessionId===sessionId)applyWebchatState(state);}
    catch(e){if(useSessionUI.getState().activeSessionId===sessionId)setError((e as Error).message);}
    finally{setOpeningPage(false);}
  }
  useEffect(()=>{const close=()=>setBrowserOpen(false),compose=(event:Event)=>{const content=(event as CustomEvent).detail.text;setText(current=>current+content);input.current?.focus();};window.addEventListener('nexus:preview',close);window.addEventListener('nexus:compose',compose);return()=>{window.removeEventListener('nexus:preview',close);window.removeEventListener('nexus:compose',compose);};},[]);
  function showBrowser(){window.dispatchEvent(new Event('nexus:preview-close'));setBrowserClosing(false);setBrowserOpen(true);}
  async function feedback(){setBusy(true);setError('');try{await request('/feedback',{sessionId:session.id,text:dialogText});setDialog(null);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  function workspaceSelect(value:string){if(value==='__add__')void chooseWorkspace().catch(e=>setError(e.message));else u.setWorkspace(value);}
  const workspaceOptions=[...u.workspaces.map(item=>({value:item.id,label:item.name,icon:<Folder size={13}/>})),{value:'__add__',label:'添加工作区…',icon:<Plus size={13}/>}];
  const composer = (<div className="session-composer-wrap" ref={composerWrap}><ReasoningActivity/><TaskControls/>{s.workspaceChanges.filter(c=>c.workspace===workspace.path&&c.operation==='created').slice(-3).map(change=><button className="workspace-new-file" key={change.id} onClick={()=>previewFile(change.path)}><File size={12}/>工作区新增 · {change.path.split(/[\\/]/).at(-1)}</button>)}{responding&&text.trim()&&<button className="queue-add" onClick={enqueue}>加入消息队列</button>}
        {empty&&tab==='chat'&&<div className="composer-context"><span className="workspace-select"><Folder size={14}/><UISelect label="当前工作区" placement="top" value={u.activeWorkspaceId} options={workspaceOptions} onChange={workspaceSelect}/></span><span className="session-mode"><GitBranch size={12}/>{session.planning?'计划模式':'标准模式'}</span></div>}
        {(session.goal||session.planning)&&<div className="session-context-chips">{session.goal&&<button onClick={()=>{setDialogText(session.goal);setDialog('goal');}}><Target size={12}/>{session.goal.slice(0,45)}</button>}{session.planning&&<button onClick={()=>u.updateSession({planning:false})}><ListTodo size={12}/>计划模式<X size={11}/></button>}</div>}
        <input type="file" ref={filePicker} hidden multiple accept=".txt,.md,.json,.csv,.js,.ts,.tsx,.py,.css,.html,.yml,.yaml,.log" onChange={event=>void readFiles(event.target.files)}/>
        <div className={'session-composer '+(text.trim()?'has-draft':'')}>
          {attachments.length>0&&<div className="attachment-chips">{attachments.map(path=><span key={path} title={path}><File size={13}/>{path.split(/[\\/]/).at(-1)}<button aria-label={'移除文件 '+path.split(/[\\/]/).at(-1)} onClick={()=>setAttachments(current=>current.filter(item=>item!==path))}><X size={12}/></button></span>)}</div>}
          {webFiles.length>0&&<div className="attachment-chips">{webFiles.map((file,index)=><span key={index}><FileText size={13}/>{file.name}<button aria-label={'移除 '+file.name} onClick={()=>setWebFiles(current=>current.filter((_,id)=>id!==index))}><X size={12}/></button></span>)}</div>}
          <motion.textarea ref={input} animate={{height:inputHeight}} transition={{type:'tween',duration:reduced?0:.16,ease:[.22,1,.36,1]}} aria-label="任务指令" placeholder={isApi?'向 API 模型发送消息，或描述希望完成的任务…':'发消息或创建任务，/ 调用指令，@ 文件或对话'} value={text} onChange={event=>{updateText(event.target.value);const previous=event.currentTarget.style.height;event.currentTarget.style.height='0px';const height=Math.min(160,Math.max(71,event.currentTarget.scrollHeight));event.currentTarget.style.height=previous;setInputHeight(height);}} onKeyDown={event=>{
            if(showCommands&&event.key==='Escape'){event.preventDefault();event.stopPropagation();setMenu(false);if(text.startsWith('/'))updateText('');return;}
            if(showCommands&&(event.key==='ArrowDown'||event.key==='ArrowUp')){event.preventDefault();setCommandIndex(index=>(index+(event.key==='ArrowUp'?-1:1)+matching.length)%Math.max(1,matching.length));return;}
            if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();if(showCommands&&matching[commandIndex])void execute(matching[commandIndex].id);else void submit();}
          }}/>
          <div className="session-composer-actions"><div><button ref={plus} className="composer-plus" title="添加文件或使用指令" aria-label="添加文件或使用指令" aria-expanded={showCommands} onClick={()=>{setMenu(!showCommands);if(text.startsWith('/'))updateText('');input.current?.focus();}}><Plus size={17}/></button><UISelect className="permission-control" placement="top" showSelectedIcon label="任务权限" value={session.permission} options={permissions} openSignal={permissionSignal} disabled={busy} onChange={value=>{if(value==='full'&&session.permission!=='full'){setAccepted(false);setDialog('full');}else void changePermission(value as PermissionMode);}}/></div><div className="session-model-actions"><ModelPicker mode={session.modelMode} provider={session.mcpProvider||s.webchat.provider} profileId={session.apiProfileId} profiles={s.apiModels} openSignal={modelSignal} disabled={responding||busy||openingPage} onSelect={(mode,id)=>void selectModel(mode,id)} onManage={onOpenModel}/>{responding?<motion.button whileHover={{scale:reduced?1:1.04}} whileTap={{scale:reduced?1:.94}} transition={{type:'tween',duration:.12}} className="session-send" aria-label={s.replyActivities[session.id]?.external?'停止接收回复':'停止任务'} title={s.replyActivities[session.id]?.external?'停止软件接收；网页生成可在网页中停止':'停止任务'} onClick={()=>{if(s.replyActivities[session.id]?.external)void request('/client/replies/stop',{sessionId:session.id,requestId:s.replyActivities[session.id].requestId}).catch(error=>setError(error.message));else if(isApi)void request('/chat/stop',{sessionId:session.id}).catch(error=>setError(error.message));else act('webchat.stop');}}><Square size={14}/></motion.button>:<motion.button whileHover={{scale:reduced?1:1.04}} whileTap={{scale:reduced?1:.94}} transition={{type:'tween',duration:.12}} className="session-send" aria-label="发送任务" disabled={!canSend||!text.trim()||busy||openingPage} title={!canSend?(isApi?'请先添加并选择 API 模型':browserLink.detail):'发送消息'} onClick={()=>void submit()}>{busy?<LoaderCircle size={16} className="spin"/>:<ArrowUp size={18}/>}</motion.button>}</div></div>
          <AnimatePresence>{showCommands&&<motion.div ref={commandRef} role="listbox" aria-label="会话指令" className="session-command-menu" initial={{opacity:0,y:reduced?0:6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:reduced?0:4}} transition={{type:'tween',duration:reduced?0:.16}}>{!matching.length?<p>没有匹配的指令</p>:matching.map((command,index)=><div key={command.id}>{(index===0||matching[index-1].group!==command.group)&&<h3>{command.group}</h3>}<button role="option" aria-selected={commandIndex===index} className={commandIndex===index?'active':''} onMouseDown={event=>event.preventDefault()} onMouseEnter={()=>setCommandIndex(index)} onClick={()=>void execute(command.id)}><command.icon size={14}/><strong>{command.label}</strong><code>{command.id}</code><small>{command.hint}</small></button></div>)}</motion.div>}</AnimatePresence>
        </div>
        {error&&<p className="session-inline-error" role="alert">{error}<button aria-label="关闭会话提示" onClick={()=>setError('')}><X size={12}/></button></p>}
        {isApi?<div className="session-browser-link api-link" role="status"><i className={apiProfile&&s.connected?'online':''}/><span>{responding?apiState.status:apiProfile?`API · ${apiProfile.name}`:'尚未选择 API 模型'}</span><button onClick={onOpenModel}>管理模型</button></div>:<div className="session-browser-link" data-ready={browserLink.canSend} role="status"><i className={browserLink.canSend?'online':''}/><span title={browserLink.detail}>{openingPage?'正在打开网页…':browserLink.label}</span>{!browserLink.busy&&<button disabled={openingPage} onClick={()=>{if(!s.connected)onConnect();else if(browserLink.external&&browserLink.extensionConnected!==true)showBrowser();else void openPage();}}>{openingPage?<LoaderCircle size={12} className="spin"/>:null}{!s.connected?'连接运行时':browserLink.external&&browserLink.extensionConnected!==true?'连接浏览器扩展':browserLink.bound?'打开原网页':`打开 ${aiName} 网页`}</button>}</div>}
        <div className="session-composer-status">{s.service.phase==='running'&&s.service.privilege==='root'&&<span className="privilege-indicator" title="电脑控制服务已获得系统 root 权限"><Shield size={11}/>root 已授权</span>}<span>{isApi?(apiState?.error||'Enter 发送 · Shift + Enter 换行'):browserLink.canSend?'Enter 发送 · Shift + Enter 换行':browserLink.detail}</span>{s.calls.length>0&&<span><Clock size={11}/>{(s.calls.reduce((total,call)=>total+Math.max(0,(call.endedAt||call.startedAt)-call.startedAt),0)/1000).toFixed(1)} 秒 · {s.calls.length} 次工具调用</span>}</div>
      </div>);
  return <section data-chat-running={responding?true:undefined} data-slot="conversation.chat.node" className={"conversation-workbench "+((browserOpen||browserClosing)?"webchat-layout":"")}><div className="webchat-conversation">
    <header className="session-header"><div className="session-title-row"><h1 title={session.title}>{session.title}</h1><span className="session-mode"><GitBranch size={12}/>{session.planning?'计划模式':'标准模式'}</span><div className="session-header-actions"><button aria-label="打开右侧预览" title="右侧预览" onClick={()=>openWorkbench('file')}><PanelRight size={15}/></button><button aria-label="查看 Git 差异" title="变更与检查" onClick={()=>openWorkbench('git')}><GitCompareArrows size={15}/></button><button aria-label="查看项目记忆" title="项目记忆" onClick={()=>openWorkbench('memory')}><Brain size={15}/></button><button aria-label="搜索与引用文件" title="搜索与引用文件" onClick={()=>openWorkbench('search')}><SearchFiles size={15}/></button>{(!empty||tab==='trace')&&<span className="workspace-select"><Folder size={14}/><UISelect label="切换工作区" value={u.activeWorkspaceId} options={workspaceOptions} placement="bottom" onChange={workspaceSelect}/></span>}<button className="webchat-browser-button" title="管理 AI 网页与浏览器连接" aria-label="打开 AI 浏览器" aria-expanded={browserOpen} onClick={()=>{if(browserOpen){setBrowserClosing(true);setBrowserOpen(false);}else showBrowser();}}><Globe size={15}/><span>AI 浏览器</span></button><button title="会话菜单" aria-label="会话菜单" onClick={()=>setMenu(!menu)}><MoreHorizontal size={17}/></button><button className="session-connection" title="连接本地运行时" aria-label="连接本地运行时" onClick={onConnect}><i className={s.connected?'online':''}/>{s.connected?'已连接':s.connecting?'正在连接':'未连接'}</button></div></div><div className="session-tabs" role="tablist" aria-label="会话视图">{([{id:'chat',label:'对话'},{id:'trace',label:'时间轴'}] as const).map(item=><button role="tab" key={item.id} aria-selected={tab===item.id} className={tab===item.id?'active':''} onClick={()=>setTab(item.id)}>{item.label}{tab===item.id&&<motion.span layoutId="conversation-tab" transition={{type:'tween',duration:reduced?0:.2,ease:[.22,1,.36,1]}}/>}</button>)}</div></header>
    <div className={`session-body ${empty&&tab==='chat'?'is-empty':''}`}>
      {empty&&tab==='chat'&&<div className="session-welcome"><h2>开始一个新任务</h2></div>}
      <div className={`conversation-stream ${tab==='chat'?'active':''}`} role="tabpanel" aria-label="对话" ref={stream} onScroll={event=>{const nearEnd=event.currentTarget.scrollHeight-event.currentTarget.scrollTop-event.currentTarget.clientHeight<48;followEnd.current=nearEnd;setAtBottom(nearEnd);}}><div className="conversation-content"><AnimatePresence initial={false}>{chatEntries.map(item=>item.message?<ChatMessage key={item.id} message={item.message} streaming={responding&&!s.questions.some(q=>q.sessionId===session.id&&q.status==='pending')&&item.message.id===s.messages.at(-1)?.id&&item.message.done!==true}/>:item.calls?<ExecutionGroup key={item.id} calls={item.calls}/>:null)}{s.questions.filter(q=>q.sessionId===session.id).map(q=><UserQuestion key={q.id} item={q}/>)}{responding&&!s.questions.some(q=>q.sessionId===session.id&&q.status==='pending')&&s.messages.at(-1)?.role!=='assistant'&&<ReplyPending key="reply-pending" provider={isApi?apiProfile?.provider:s.webchat.provider}/>}</AnimatePresence>{s.approvals.map(approval=><div className="session-approval" key={approval.id}><Shield size={17}/><div><strong>{approval.title}</strong><p>{approval.description}</p></div><button onClick={()=>void request(`/approvals/${encodeURIComponent(approval.id)}`,{allowed:false}).catch(e=>setError(e.message))}>拒绝</button><button onClick={()=>void request(`/approvals/${encodeURIComponent(approval.id)}`,{allowed:true}).catch(e=>setError(e.message))}>允许</button></div>)}</div></div>
      {tab==='trace'&&<Trajectory messages={s.messages} calls={s.calls} timeline={session.timeline} composer={composer} onModalChange={setTrajectoryModal}/>}
      {!empty&&!atBottom&&tab==='chat'&&<button className="scroll-to-bottom" aria-label="跳转到底部" onClick={()=>{followEnd.current=true;setAtBottom(true);stream.current?.scrollTo({top:stream.current.scrollHeight,behavior:reduced?'instant':'smooth'});}}><ArrowDown size={16}/></button>}
      {tab==='chat'&&composer}
    </div>
    <AnimatePresence>{dialog==='full'&&<SessionDialog title="确认启用完全权限？" onClose={()=>setDialog(null)} footer={<><button className="shell-outline-button" onClick={()=>setDialog(null)}>取消</button><button className="extension-install-button" disabled={!accepted||busy} onClick={()=>void changePermission('full')}>{busy?'等待系统授权…':'启用完全权限'}</button></>}><div className="full-access-description"><AlertCircle size={18}/><p>启用后将免除逐次工具审批。Linux 会自动打开系统授权窗口，认证后电脑控制服务以 root 运行，可修改系统文件和控制高权限进程。关闭完全权限会停止高权限服务及其终端。</p></div><label className="full-access-check"><input type="checkbox" checked={accepted} onChange={event=>setAccepted(event.target.checked)}/>我已了解风险，并愿意继续</label>{error&&<p className="settings-error" role="alert">{error}</p>}</SessionDialog>}
    {dialog==='goal'&&<SessionDialog title="任务目标" onClose={()=>setDialog(null)} footer={<><button className="shell-outline-button" onClick={()=>{u.updateSession({goal:''});setDialog(null);}}>清除目标</button><button className="extension-install-button" onClick={()=>{u.updateSession({goal:dialogText.trim()});setDialog(null);}}>保存目标</button></>}><p>目标会作为当前会话的任务上下文。</p><textarea aria-label="任务目标" autoFocus value={dialogText} placeholder="希望这个会话最终完成什么？" onChange={event=>setDialogText(event.target.value)}/></SessionDialog>}
    {dialog==='feedback'&&<SessionDialog title="会话反馈" onClose={()=>setDialog(null)} footer={<><button className="shell-outline-button" onClick={()=>setDialog(null)}>取消</button><button className="extension-install-button" disabled={!s.connected||!dialogText.trim()||busy} onClick={()=>void feedback()}>{busy?'正在提交…':'提交反馈'}</button></>}><p>反馈将提交给当前连接的本地运行时。</p><textarea aria-label="反馈内容" value={dialogText} onChange={event=>setDialogText(event.target.value)} placeholder="描述遇到的问题或改进建议"/>{!s.connected&&<p className="settings-caption">连接本地运行时后可提交反馈。</p>}{error&&<p className="settings-error" role="alert">{error}</p>}</SessionDialog>}</AnimatePresence>
  </div><RightPreview/><AnimatePresence initial={false} onExitComplete={()=>setBrowserClosing(false)}>{browserOpen&&<AIBrowserPanel key="ai-browser-panel" link={browserLink} opening={openingPage} pageError={error} onOpenPage={openPage} suspended={browserSuspended||s.settingsOpen||!!dialog||trajectoryModal} onConnect={onConnect} onClose={()=>{setBrowserClosing(true);setBrowserOpen(false);}}/>}</AnimatePresence></section>;
}
