import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {AnimatePresence,motion,useReducedMotion} from 'framer-motion';
import {ChevronRight,MoreHorizontal,PlusCircle,SquarePen,Trash2,FolderOpen,Copy,TerminalSquare,Download,MessageSquare,Pin,Files} from 'lucide-react';
import {useSessionUI,type Workspace,type ChatSession} from '../session-ui';
import {request} from '../connection';
import {openInExplorer} from './FilePreview';
import {useStudio} from '../store';
import {SessionDialog} from './SessionDialog';
import '../workspace-sidebar.css';

const ease=[.22,1,.36,1] as const;
function ageLabel(at:number){const days=Math.max(0,Math.floor((Date.now()-at)/86400000));return days===0?'今天':days<30?`${days}天`:days<365?`${Math.floor(days/30)}个月`:`${Math.floor(days/365)}年`;}
export function WorkspaceSidebar({query,isChat,onSelect}:{query:string;isChat:boolean;onSelect:()=>void}){
  const ui=useSessionUI();const s=useStudio();const reduced=useReducedMotion();
  const[expanded,setExpanded]=useState<Record<string,boolean>>({});
  const[menu,setMenu]=useState<{workspace:Workspace;session?:ChatSession;left:number;top:number;trigger:HTMLButtonElement}|null>(null);
  const[dialog,setDialog]=useState<{kind:'rename'|'remove';workspace:Workspace;session?:ChatSession}|null>(null);const[name,setName]=useState('');
  const menuRef=useRef<HTMLDivElement>(null);
  const tween={type:'tween' as const,duration:reduced?0:.2,ease};
  function canChange(){if(s.phase==='idle')return true;s.set({error:'请先停止当前任务，再切换或移除工作区。'});return false;}
  function closeMenu(){menu?.trigger.focus();setMenu(null);}
  function openMenu(workspace:Workspace,trigger:HTMLButtonElement,session?:ChatSession){if(menu?.workspace.id===workspace.id&&menu.session?.id===session?.id){closeMenu();return;}const rect=trigger.getBoundingClientRect();setMenu({workspace,session,trigger,left:Math.max(8,Math.min(rect.left,innerWidth-178)),top:Math.min(rect.bottom+5,innerHeight-330)});}
  useEffect(()=>{if(!menu)return;const outside=(event:PointerEvent)=>{if(!menuRef.current?.contains(event.target as Node)&&!menu.trigger.contains(event.target as Node))setMenu(null);};const resize=()=>setMenu(null);document.addEventListener('pointerdown',outside);window.addEventListener('resize',resize);const frame=requestAnimationFrame(()=>menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus());return()=>{cancelAnimationFrame(frame);document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',resize);};},[menu]);
  const noMatches=!!query&&!ui.sessions.some(item=>item.title.toLowerCase().includes(query.toLowerCase()))&&!ui.workspaces.some(item=>item.name.toLowerCase().includes(query.toLowerCase()));
  return <>
    {ui.workspaces.map(workspace=>{
      const all=ui.sessions.filter(item=>item.workspaceId===workspace.id).sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||b.updatedAt-a.updatedAt);
      const filtered=all.filter(item=>item.title.toLowerCase().includes(query.toLowerCase())||workspace.name.toLowerCase().includes(query.toLowerCase()));
      if(query&&!filtered.length&&!workspace.name.toLowerCase().includes(query.toLowerCase()))return null;
      const isOpen=!!query||!workspace.collapsed;const showAll=expanded[workspace.id]||!!query;const shown=showAll?filtered:filtered.slice(0,5);
      return <div className={'workspace-group '+(workspace.id===ui.activeWorkspaceId?'current':'')} key={workspace.id}>
        <div className="workspace-group-header" onContextMenu={event=>{event.preventDefault();const trigger=event.currentTarget.querySelector<HTMLButtonElement>('button')!;setMenu({workspace,trigger,left:Math.min(event.clientX,innerWidth-220),top:Math.min(event.clientY,innerHeight-330)});}}>
          <button className="workspace-group-toggle" aria-expanded={isOpen} title={workspace.path||workspace.name} onClick={()=>ui.toggleWorkspace(workspace.id)}><ChevronRight size={12} className={isOpen?'open':''}/><span>{workspace.name}</span></button>
          <div className="workspace-group-actions"><button aria-label={`${workspace.name} 工作区菜单`} aria-haspopup="menu" aria-expanded={menu?.workspace.id===workspace.id} onClick={event=>openMenu(workspace,event.currentTarget)}><MoreHorizontal size={15}/></button><button aria-label={`在 ${workspace.name} 新建会话`} title="新建会话" onClick={()=>{if(!canChange())return;ui.createSession(workspace.id);onSelect();}}><PlusCircle size={15}/></button></div>
        </div>
        <AnimatePresence initial={false}>{isOpen&&<motion.div className="workspace-session-list" key="sessions" initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={tween}>
          <AnimatePresence initial={false}>{shown.map(item=><motion.div layout="position" key={item.id} className={'workspace-session-row '+(ui.activeSessionId===item.id&&isChat?'active ':'')+(menu?.session?.id===item.id?'menu-open':'')} initial={{opacity:0,x:reduced?0:-5}} animate={{opacity:1,x:0}} exit={{opacity:0,height:0}} transition={tween} onContextMenu={event=>{event.preventDefault();const trigger=event.currentTarget.querySelector<HTMLButtonElement>('button')!;setMenu({workspace,session:item,trigger,left:Math.min(event.clientX,innerWidth-220),top:Math.min(event.clientY,innerHeight-330)});}}><button className="workspace-session-button" title={item.title} onClick={()=>{if(!canChange())return;ui.selectSession(item.id);onSelect();}}><span>{item.pinned&&<Pin size={11}/>} {item.title}</span><time dateTime={new Date(item.updatedAt).toISOString()}>{ageLabel(item.updatedAt)}</time></button><button className="workspace-chat-menu" aria-label={`${item.title} 聊天菜单`} aria-haspopup="menu" aria-expanded={menu?.session?.id===item.id} onClick={event=>openMenu(workspace,event.currentTarget,item)}><MoreHorizontal size={14}/></button></motion.div>)}</AnimatePresence>
          {!filtered.length&&<p className="workspace-no-sessions">还没有会话</p>}
          {!query&&filtered.length>5&&<button className="workspace-expand-sessions" onClick={()=>setExpanded(current=>({...current,[workspace.id]:!current[workspace.id]}))}>{showAll?'收起会话':`展开其余 ${filtered.length-5} 个会话`}</button>}
        </motion.div>}</AnimatePresence>
      </div>;
    })}
    {noMatches&&<p className="workspace-no-sessions">没有匹配的会话或工作区</p>}
    {createPortal(<AnimatePresence>{menu&&<motion.div role="menu" aria-label={menu.session?'聊天操作':'工作区操作'} ref={menuRef} className="workspace-context-menu" style={{left:menu.left,top:menu.top}} initial={{opacity:0,y:reduced?0:-4,scale:reduced?1:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:reduced?0:-3}} transition={{...tween,duration:reduced?0:.14}} onKeyDown={event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeMenu();}
      if(event.key==='Tab'){setMenu(null);return;}
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const buttons=[...menuRef.current!.querySelectorAll<HTMLButtonElement>('button')];const at=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[(at+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}
    }}>
      <button role="menuitem" onClick={()=>{if(canChange()){ui.createSession(menu.workspace.id);onSelect();}closeMenu();}}><MessageSquare size={14}/>新建会话</button>
      {!menu.session&&<><button role="menuitem" disabled={!menu.workspace.path} onClick={()=>{void openInExplorer(menu.workspace.path).catch(error=>s.set({error:error.message}));closeMenu();}}><FolderOpen size={14}/>在资源管理器中打开</button><button role="menuitem" disabled={!menu.workspace.path||!s.connected} onClick={()=>{window.dispatchEvent(new Event('nexus:terminal'));void request('/tools/call',{name:'terminal_create',args:{cwd:menu.workspace.path}}).catch(error=>s.set({error:error.message}));closeMenu();}}><TerminalSquare size={14}/>在此处打开终端</button><button role="menuitem" disabled={!menu.workspace.path} onClick={()=>{sessionStorage.setItem('nexus.explore-path',menu.workspace.path);window.dispatchEvent(new CustomEvent('nexus:explore',{detail:{path:menu.workspace.path}}));closeMenu();}}><Files size={14}/>浏览项目文件</button></>}
      {menu.session&&<><button role="menuitem" onClick={()=>{ui.updateSessionId(menu.session!.id,{pinned:!menu.session!.pinned});closeMenu();}}><Pin size={14}/>{menu.session.pinned?'取消置顶':'置顶聊天'}</button><button role="menuitem" onClick={()=>{const text=menu.session!.messages.map(message=>`## ${message.role==='user'?'用户':'助手'}\n\n${message.content}`).join('\n\n');const url=URL.createObjectURL(new Blob([text],{type:'text/markdown'}));const a=document.createElement('a');a.href=url;a.download=menu.session!.title+'.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);closeMenu();}}><Download size={14}/>导出对话 Markdown</button></>}
      <button role="menuitem" onClick={()=>{const text=menu.session?menu.session.messages.map(message=>message.content).join('\n\n'):menu.workspace.path;const copy=window.nexusDesktop?.copyText?window.nexusDesktop.copyText(text):navigator.clipboard.writeText(text);void Promise.resolve(copy).catch(error=>s.set({error:error.message}));closeMenu();}}><Copy size={14}/>{menu.session?'复制对话':'复制项目路径'}</button>
      <button role="menuitem" onClick={()=>{setName(menu.session?.title||menu.workspace.name);setDialog({kind:'rename',workspace:menu.workspace,session:menu.session});closeMenu();}}><SquarePen size={14}/>重命名</button><button role="menuitem" className="danger" onClick={()=>{if(canChange())setDialog({kind:'remove',workspace:menu.workspace,session:menu.session});closeMenu();}}><Trash2 size={14}/>{menu.session?'删除聊天':'删除工作区'}</button></motion.div>}</AnimatePresence>,document.body)}
    <AnimatePresence>{dialog&&<SessionDialog title={dialog.kind==='rename'?(dialog.session?'重命名聊天':'重命名工作区'):(dialog.session?'删除聊天':'删除工作区')} onClose={()=>setDialog(null)} footer={<><button className="shell-outline-button" onClick={()=>setDialog(null)}>取消</button><button className={dialog.kind==='remove'?'workspace-delete-confirm':'extension-install-button'} disabled={dialog.kind==='rename'&&!name.trim()} onClick={()=>{if(dialog.kind==='rename'){if(dialog.session)ui.renameSession(dialog.session.id,name);else ui.renameWorkspace(dialog.workspace.id,name);}else{if(!canChange())return;if(dialog.session)ui.removeSession(dialog.session.id);else ui.removeWorkspace(dialog.workspace.id);onSelect();}setDialog(null);}}>{dialog.kind==='rename'?'保存名称':dialog.session?'删除聊天':'删除工作区'}</button></>}>
      {dialog.kind==='rename'?<label className="workspace-name-field">{dialog.session?'聊天名称':'工作区名称'}<input autoFocus aria-label={dialog.session?'聊天名称':'工作区名称'} maxLength={80} value={name} onChange={event=>setName(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&name.trim()){event.preventDefault();if(dialog.session)ui.renameSession(dialog.session.id,name);else ui.renameWorkspace(dialog.workspace.id,name);setDialog(null);}}}/></label>:dialog.session?<p>将删除此应用中保存的「{dialog.session.title}」会话及执行记录。</p>:<p>将从侧栏移除「{dialog.workspace.name}」及其 {ui.sessions.filter(item=>item.workspaceId===dialog.workspace.id).length} 个本地会话记录。磁盘中的文件和文件夹会保留。</p>}
    </SessionDialog>}</AnimatePresence>
  </>;
}
