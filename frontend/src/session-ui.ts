import {create} from 'zustand';
import type {Message,ToolCall} from './types';
export type PermissionMode='readonly'|'workspace'|'full';
export interface Workspace {id:string;name:string;path:string;collapsed?:boolean}
export interface ChatSession {historyLoaded?:boolean;queue?:{id:string;text:string}[];queuePaused?:boolean;plan?:{id:string;text:string;status:'pending'|'running'|'done'}[];compactionSummary?:string;reasoningEffort?:string;archived?:boolean;parentSessionId?:string;pinned?:boolean;id:string;workspaceId:string;title:string;customTitle?:boolean;updatedAt:number;messages:Message[];calls:ToolCall[];timeline:{id:string;kind:'message'|'tool';at:number}[];goal:string;planning:boolean;permission:PermissionMode;modelMode:'mcp'|'api';apiProfileId:string;mcpProvider:string;draft:string}
interface SessionUI {
  workspaces:Workspace[];sessions:ChatSession[];activeWorkspaceId:string;activeSessionId:string;
  createSession:(workspaceId?:string)=>ChatSession;selectSession:(id:string)=>ChatSession|undefined;
  addWorkspace:(path:string)=>void;setWorkspace:(id:string)=>void;
  renameWorkspace:(id:string,name:string)=>void;removeWorkspace:(id:string)=>void;toggleWorkspace:(id:string)=>void;
  renameSession:(id:string,title:string)=>void;removeSession:(id:string)=>void;
  updateSession:(patch:Partial<ChatSession>)=>void;updateSessionId:(id:string,patch:Partial<ChatSession>)=>void;captureSession:(id:string,messages:Message[],calls:ToolCall[])=>void;capture:(messages:Message[],calls:ToolCall[])=>void;
}
function newSession(workspaceId:string):ChatSession{return {id:crypto.randomUUID(),workspaceId,title:'新会话',updatedAt:Date.now(),messages:[],calls:[],timeline:[],goal:'',planning:false,permission:'workspace',modelMode:'mcp',apiProfileId:'',mcpProvider:'chatgpt',draft:''};}
const initialWorkspace:Workspace={id:'default',name:'本地工作空间',path:''};
let saved:Partial<SessionUI>={};
try{saved=JSON.parse(localStorage.getItem('nexus.sessions')||'{}');}catch{}
const workspaces=Array.isArray(saved.workspaces)&&saved.workspaces.length?saved.workspaces.filter(item=>typeof item.id==='string'&&typeof item.path==='string'):[initialWorkspace];
if(!workspaces.length)workspaces.push(initialWorkspace);
const sessions:ChatSession[]=Array.isArray(saved.sessions)?saved.sessions.filter(item=>item.id&&Array.isArray(item.messages)&&Array.isArray(item.calls)).map(item=>({...item,modelMode:(item.modelMode==='api'?'api':'mcp') as ChatSession['modelMode'],apiProfileId:item.apiProfileId||'',mcpProvider:item.mcpProvider||'chatgpt',draft:item.draft||'',timeline:item.timeline||[],permission:item.permission||'workspace'})):[];
if(!sessions.length)sessions.push(newSession(workspaces[0].id));
let diskReady=false;const pendingDisk=new Map<string,ChatSession>();const lastDiskSessions=new Map<string,ChatSession>();
let saveTimer:ReturnType<typeof setTimeout>;
function cacheState(){const state=useSessionUI.getState();try{localStorage.setItem('nexus.sessions',JSON.stringify({workspaces:state.workspaces,sessions:state.sessions,activeWorkspaceId:state.activeWorkspaceId,activeSessionId:state.activeSessionId}));}catch{}}
let diskOperation:Promise<void>=Promise.resolve();
const diskWorkspaces=new Map<string,Workspace>();
function writePending(){
 const operation=diskOperation.catch(()=>{}).then(async()=>{
  if(!diskReady)return;
  const state=useSessionUI.getState();
  for(const workspace of state.workspaces){if(diskWorkspaces.get(workspace.id)===workspace)continue;const response=await fetch('/api/workspaces/'+encodeURIComponent(workspace.id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(workspace),signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('项目设置保存失败');diskWorkspaces.set(workspace.id,workspace);}
  for(const session of [...pendingDisk.values()]){const response=await fetch('/api/sessions/'+encodeURIComponent(session.id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(session),signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('会话保存失败，草稿仍保留在当前窗口');if(pendingDisk.get(session.id)===session)pendingDisk.delete(session.id);}
 });diskOperation=operation;return operation;
}
function persist(){const current=useSessionUI.getState();for(const session of current.sessions)if(lastDiskSessions.get(session.id)!==session){lastDiskSessions.set(session.id,session);pendingDisk.set(session.id,session);}clearTimeout(saveTimer);saveTimer=setTimeout(()=>{cacheState();void writePending().catch(error=>window.dispatchEvent(new CustomEvent('nexus:persistence-error',{detail:error.message})));},350);}
export const useSessionUI=create<SessionUI>((set,get)=>({
  workspaces,sessions,activeWorkspaceId:workspaces.some(item=>item.id===saved.activeWorkspaceId)?saved.activeWorkspaceId!:workspaces[0].id,activeSessionId:sessions.some(item=>item.id===saved.activeSessionId)?saved.activeSessionId!:sessions[0].id,
  createSession:(workspaceId)=>{const target=get().workspaces.find(item=>item.id===workspaceId)?.id||get().activeWorkspaceId;const session=newSession(target);set({sessions:[session,...get().sessions],activeWorkspaceId:target,activeSessionId:session.id,workspaces:get().workspaces.map(item=>item.id===target?{...item,collapsed:false}:item)});persist();return session;},
  selectSession:id=>{const session=get().sessions.find(item=>item.id===id);if(session){set({activeSessionId:id,activeWorkspaceId:session.workspaceId});if(diskReady)void fetch('/api/sessions/'+encodeURIComponent(id)).then(response=>{if(!response.ok)throw new Error('历史记录读取失败');return response.json();}).then(saved=>{if(get().activeSessionId!==id)return;set({sessions:get().sessions.map(item=>item.id===id?{...saved,historyLoaded:true}:item)});window.dispatchEvent(new CustomEvent('nexus:session-history',{detail:saved}));}).catch(()=>{});persist();}return session;},
  addWorkspace:path=>{const existing=get().workspaces.find(item=>item.path===path);if(existing){get().setWorkspace(existing.id);return;}const workspace={id:crypto.randomUUID(),name:path.replace(/[\\/]+$/,'').split(/[\\/]/).at(-1)||path,path};set({workspaces:[...get().workspaces,workspace],activeWorkspaceId:workspace.id});get().createSession();persist();},
  setWorkspace:id=>{if(!get().workspaces.some(item=>item.id===id))return;set({activeWorkspaceId:id});const session=get().sessions.find(item=>item.workspaceId===id);if(session)set({activeSessionId:session.id});else get().createSession();persist();},
  renameWorkspace:(id,name)=>{const trimmed=name.trim();if(!trimmed)return;set({workspaces:get().workspaces.map(item=>item.id===id?{...item,name:trimmed.slice(0,80)}:item)});persist();},
  toggleWorkspace:id=>{set({workspaces:get().workspaces.map(item=>item.id===id?{...item,collapsed:!item.collapsed}:item)});persist();},
  removeWorkspace:id=>{
    if(!get().workspaces.some(item=>item.id===id))return;
    for(const session of get().sessions)if(session.workspaceId===id)pendingDisk.delete(session.id);
    let workspaces=get().workspaces.filter(item=>item.id!==id),sessions=get().sessions.filter(item=>item.workspaceId!==id);
    if(!workspaces.length)workspaces=[{id:crypto.randomUUID(),name:'本地工作空间',path:''}];
    const activeWorkspaceId=workspaces.some(item=>item.id===get().activeWorkspaceId)?get().activeWorkspaceId:workspaces[0].id;
    let activeSession=sessions.find(item=>item.id===get().activeSessionId&&item.workspaceId===activeWorkspaceId)||sessions.find(item=>item.workspaceId===activeWorkspaceId);
    if(!activeSession){activeSession=newSession(activeWorkspaceId);sessions=[activeSession,...sessions];}
    set({workspaces,sessions,activeWorkspaceId,activeSessionId:activeSession.id});for(const session of get().sessions)if(session.workspaceId===id)pendingDisk.delete(session.id);if(diskReady)void fetch('/api/workspaces/'+encodeURIComponent(id),{method:'DELETE'});persist();
  },
  renameSession:(id,title)=>{const trimmed=title.trim();if(!trimmed)return;set({sessions:get().sessions.map(item=>item.id===id?{...item,title:trimmed.slice(0,80),customTitle:true}:item)});persist();},
  removeSession:id=>{
    const removed=get().sessions.find(item=>item.id===id);if(!removed)return;
    let sessions=get().sessions.filter(item=>item.id!==id);let activeSessionId=get().activeSessionId;
    if(activeSessionId===id){let next=sessions.find(item=>item.workspaceId===removed.workspaceId);if(!next){next=newSession(removed.workspaceId);sessions=[next,...sessions];}activeSessionId=next.id;}
    set({sessions,activeSessionId});pendingDisk.delete(id);if(diskReady)void fetch('/api/sessions/'+encodeURIComponent(id),{method:'DELETE'});persist();
  },
  updateSessionId:(id,patch)=>{set({sessions:get().sessions.map(item=>item.id===id?{...item,...patch}:item)});persist();},
  updateSession:patch=>get().updateSessionId(get().activeSessionId,patch),
  captureSession:(id,messages,calls)=>{const current=get().sessions.find(item=>item.id===id);if(!current)return;const timeline=[...current.timeline];for(const message of messages)if(!timeline.some(item=>item.id===message.id&&item.kind==='message'))timeline.push({id:message.id,kind:'message',at:message.createdAt||Date.now()});for(const call of calls)if(!timeline.some(item=>item.id===call.id&&item.kind==='tool'))timeline.push({id:call.id,kind:'tool',at:call.startedAt});timeline.sort((a,b)=>a.at-b.at);get().updateSessionId(id,{messages,calls,timeline,title:current.customTitle?current.title:messages.find(item=>item.role==='user')?.content.slice(0,28)||current.title,updatedAt:Date.now()});},
  capture:(messages,calls)=>get().captureSession(get().activeSessionId,messages,calls),
}));

export async function chooseWorkspace(){
  if(!window.nexusDesktop?.selectWorkspacePath){window.dispatchEvent(new Event('nexus:choose-workspace'));return null;}
  const path=await window.nexusDesktop?.selectWorkspacePath?.();
  if(path)useSessionUI.getState().addWorkspace(path);
  return path;
}

export async function hydrateLocalSessions(){
 const ui=useSessionUI.getState(),response=await fetch('/api/sessions/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workspaces:ui.workspaces,sessions:ui.sessions,activeWorkspaceId:ui.activeWorkspaceId,activeSessionId:ui.activeSessionId})});
 if(!response.ok)throw new Error('本地会话迁移失败，原浏览器记录已保留');
 const saved=await response.json();if(saved.sessions?.length){const sessions=saved.sessions.map((item:ChatSession)=>({...newSession(item.workspaceId),...item,queuePaused:(item.queue?.length||0)>0?true:item.queuePaused}));const active=sessions.some((s:ChatSession)=>s.id===ui.activeSessionId)?ui.activeSessionId:sessions[0].id;useSessionUI.setState({workspaces:saved.workspaces,sessions,activeSessionId:active,activeWorkspaceId:sessions.find((s:ChatSession)=>s.id===active)!.workspaceId});}
 diskReady=true;pendingDisk.clear();
}

// Native plugin reloads must wait until draft/queue/history writes settle.
export async function flushLocalSessions(){
 clearTimeout(saveTimer);cacheState();await writePending();
}
