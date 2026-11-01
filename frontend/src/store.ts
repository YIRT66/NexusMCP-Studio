import {create} from 'zustand';
import type {Settings,Mode,View,Phase,Tool,ToolCall,Message,Approval,Frame,ServerEntry,ServiceState,ServiceLog,HistoryEntry,WebchatState} from './types';
import {useSessionUI} from './session-ui';
interface State {
 platform:string;terminalShells:string[];
 webchat:WebchatState;
 connected:boolean;connecting:boolean;mode:Mode;phase:Phase;view:View;sidebar:boolean;settingsOpen:boolean;
 settings:Settings;service:ServiceState;tools:Tool[];calls:ToolCall[];logs:ServiceLog[];history:HistoryEntry[];messages:Message[];approvals:Approval[];servers:ServerEntry[];
 frame:Frame|null;cursor:{x:number;y:number;clickId?:string}|null;metrics:{cpu:number;memory:number;history:number[]}|null;error:string;
 terminalId:string|null;terminalVersion:number;terminalChunks:string[];set:(patch:Partial<State>)=>void;receive:(event:{type:string;data:any})=>void;
}
export const useStudio=create<State>((set,get)=>({
 platform:'',terminalShells:['default'],
 webchat:{provider:'chatgpt',providers:[],status:'打开 AI 网页并登录',busy:false},
 connected:false,connecting:true,mode:'safe',phase:'idle',view:'desktop',sidebar:true,settingsOpen:false,
 settings:{provider:'',model:'',baseUrl:'',apiKey:'',frameRate:1,theme:'dark',fontSize:14,detail:'standard',autoCollapse:true,mode:'safe',disabled:[],prompt:''},
 service:{phase:'stopped',url:'',localUrl:'',error:'',lastClient:'',clientAt:0,startedAt:0,localOnly:false},
 tools:[],calls:[],logs:[],history:[],messages:[],approvals:[],servers:[],frame:null,cursor:null,metrics:null,error:'',terminalId:null,terminalVersion:0,terminalChunks:[],set,
 receive:({type,data})=>{
  if(type==='webchat.history'){
   const ui=useSessionUI.getState();
   if(data.sessionId===ui.activeSessionId)set({messages:data.messages});
   else{useSessionUI.setState({sessions:ui.sessions.map(session=>session.id===data.sessionId?{...session,messages:data.messages,updatedAt:Date.now()}:session)});}return;
  }
  if(type==='webchat.state'){set({webchat:data,phase:data.busy?'executing':'idle'});return;}
  if(type==='message.upsert'){
   const ui=useSessionUI.getState();
   if(data.sessionId&&data.sessionId!==ui.activeSessionId){const target=ui.sessions.find(s=>s.id===data.sessionId);if(target){const messages=target.messages.some(m=>m.id===data.id)?target.messages.map(m=>m.id===data.id?data:m):[...target.messages,data];useSessionUI.setState({sessions:ui.sessions.map(s=>s.id===target.id?{...s,messages,updatedAt:Date.now()}:s)});}return;}
   set({messages:get().messages.some(m=>m.id===data.id)?get().messages.map(m=>m.id===data.id?data:m):[...get().messages,data]});return;
  }
  if(type==='service.state')set({service:data,...(data.phase==='starting'?{logs:[],approvals:[],frame:null}:{})});
  else if(type==='service.log')set({logs:[...get().logs,data].slice(-300)});
  else if(type==='history.changed')set({history:data});
  else if(type==='settings.changed')set({settings:{...get().settings,...data}});
  else if(type==='tools.changed')set({tools:data});
  else if(type==='telemetry')set({metrics:{cpu:data.cpu,memory:data.memory,history:[...(get().metrics?.history||[]),data.cpu].slice(-30)}});
  else if(type==='agent.status')set({phase:data.phase});
  else if(type==='mode.changed')set({mode:data.mode});
  else if(type==='screen.frame')set({frame:data});
  else if(type==='screen.clear')set({frame:null,cursor:null});
  else if(type==='cursor')set({cursor:data});
  else if(type==='tool.started')set({calls:[...get().calls.filter(c=>c.id!==data.id),{...data,status:'running'}].slice(-200),tools:get().tools.map(t=>t.name===data.name?{...t,calls:t.calls+1,running:true}:t)});
  else if(type==='tool.finished')set({calls:get().calls.some(c=>c.id===data.id)?get().calls.map(c=>c.id===data.id?{...c,...data}:c):[...get().calls,data].slice(-200),tools:get().tools.map(t=>t.name===data.name?{...t,running:false}:t)});
  else if(type==='approval.requested')set({approvals:[...get().approvals,data]});
  else if(type==='approval.resolved')set({approvals:get().approvals.filter(a=>a.id!==data.id)});
  else if(type==='approvals.clear')set({approvals:[]});
  else if(type==='terminal.output')set({terminalChunks:[...get().terminalChunks,data.text].slice(-2000),terminalVersion:get().terminalVersion+1});
  else if(type==='terminal.created')set({terminalId:data.id,terminalChunks:[],terminalVersion:get().terminalVersion+1});
  else if(type==='terminal.closed')set({terminalId:null});
  else if(type==='error')set({error:data.message});
 }
}));
