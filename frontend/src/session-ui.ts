import {create} from 'zustand';
import type {Message,ToolCall} from './types';
export type PermissionMode='readonly'|'workspace'|'full';
export interface Workspace {id:string;name:string;path:string;collapsed?:boolean}
export interface ChatSession {pinned?:boolean;id:string;workspaceId:string;title:string;customTitle?:boolean;updatedAt:number;messages:Message[];calls:ToolCall[];timeline:{id:string;kind:'message'|'tool';at:number}[];goal:string;planning:boolean;permission:PermissionMode;modelMode:'mcp'|'api';apiProfileId:string;mcpProvider:string;draft:string}
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
let saveTimer:ReturnType<typeof setTimeout>;
function persist(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{const state=useSessionUI.getState();try{localStorage.setItem('nexus.sessions',JSON.stringify({workspaces:state.workspaces,sessions:state.sessions.slice(0,30),activeWorkspaceId:state.activeWorkspaceId,activeSessionId:state.activeSessionId}));}catch{}},250);}
export const useSessionUI=create<SessionUI>((set,get)=>({
  workspaces,sessions,activeWorkspaceId:workspaces.some(item=>item.id===saved.activeWorkspaceId)?saved.activeWorkspaceId!:workspaces[0].id,activeSessionId:sessions.some(item=>item.id===saved.activeSessionId)?saved.activeSessionId!:sessions[0].id,
  createSession:(workspaceId)=>{const target=get().workspaces.find(item=>item.id===workspaceId)?.id||get().activeWorkspaceId;const session=newSession(target);set({sessions:[session,...get().sessions],activeWorkspaceId:target,activeSessionId:session.id,workspaces:get().workspaces.map(item=>item.id===target?{...item,collapsed:false}:item)});persist();return session;},
  selectSession:id=>{const session=get().sessions.find(item=>item.id===id);if(session){set({activeSessionId:id,activeWorkspaceId:session.workspaceId});persist();}return session;},
  addWorkspace:path=>{const existing=get().workspaces.find(item=>item.path===path);if(existing){get().setWorkspace(existing.id);return;}const workspace={id:crypto.randomUUID(),name:path.replace(/[\\/]+$/,'').split(/[\\/]/).at(-1)||path,path};set({workspaces:[...get().workspaces,workspace],activeWorkspaceId:workspace.id});get().createSession();persist();},
  setWorkspace:id=>{if(!get().workspaces.some(item=>item.id===id))return;set({activeWorkspaceId:id});const session=get().sessions.find(item=>item.workspaceId===id);if(session)set({activeSessionId:session.id});else get().createSession();persist();},
  renameWorkspace:(id,name)=>{const trimmed=name.trim();if(!trimmed)return;set({workspaces:get().workspaces.map(item=>item.id===id?{...item,name:trimmed.slice(0,80)}:item)});persist();},
  toggleWorkspace:id=>{set({workspaces:get().workspaces.map(item=>item.id===id?{...item,collapsed:!item.collapsed}:item)});persist();},
  removeWorkspace:id=>{
    if(!get().workspaces.some(item=>item.id===id))return;
    let workspaces=get().workspaces.filter(item=>item.id!==id),sessions=get().sessions.filter(item=>item.workspaceId!==id);
    if(!workspaces.length)workspaces=[{id:crypto.randomUUID(),name:'本地工作空间',path:''}];
    const activeWorkspaceId=workspaces.some(item=>item.id===get().activeWorkspaceId)?get().activeWorkspaceId:workspaces[0].id;
    let activeSession=sessions.find(item=>item.id===get().activeSessionId&&item.workspaceId===activeWorkspaceId)||sessions.find(item=>item.workspaceId===activeWorkspaceId);
    if(!activeSession){activeSession=newSession(activeWorkspaceId);sessions=[activeSession,...sessions];}
    set({workspaces,sessions,activeWorkspaceId,activeSessionId:activeSession.id});persist();
  },
  renameSession:(id,title)=>{const trimmed=title.trim();if(!trimmed)return;set({sessions:get().sessions.map(item=>item.id===id?{...item,title:trimmed.slice(0,80),customTitle:true}:item)});persist();},
  removeSession:id=>{
    const removed=get().sessions.find(item=>item.id===id);if(!removed)return;
    let sessions=get().sessions.filter(item=>item.id!==id);let activeSessionId=get().activeSessionId;
    if(activeSessionId===id){let next=sessions.find(item=>item.workspaceId===removed.workspaceId);if(!next){next=newSession(removed.workspaceId);sessions=[next,...sessions];}activeSessionId=next.id;}
    set({sessions,activeSessionId});persist();
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
