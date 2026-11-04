import {create} from 'zustand';
import type {DshState,ApiModelProfile,ApiChatState,Settings,Mode,View,Phase,Tool,ToolCall,Message,Approval,Frame,ServerEntry,ServiceState,ServiceLog,HistoryEntry,WebchatState} from './types';
import {useSessionUI} from './session-ui';
interface State {
 replyActivities:Record<string,import('./types').ReplyActivity>;
 fault:{paused:boolean;incident:null|{id:string;at:string;source:string;message:string;stack:string;logDirectory:string}};
 workspaceChanges:{id:string;workspace:string;path:string;operation:string;source:string;at:number}[];
 questions:import('./types').UserQuestionSet[];
 preview?:{sessionId:string;workspace:string};
 browserInstall:{phase:string;progress:string;error?:string};
 extensions:import('./extensions').ExtensionEntry[];
 publicAccess:import('./types').PublicAccessState;remote:boolean;
 dsh:DshState;
 apiModels:ApiModelProfile[];apiChats:Record<string,ApiChatState>;
 platform:string;terminalShells:string[];
 webchat:WebchatState;
 connected:boolean;connecting:boolean;mode:Mode;phase:Phase;view:View;sidebar:boolean;settingsOpen:boolean;
 settings:Settings;service:ServiceState;tools:Tool[];calls:ToolCall[];logs:ServiceLog[];history:HistoryEntry[];messages:Message[];approvals:Approval[];servers:ServerEntry[];
 frame:Frame|null;cursor:{x:number;y:number;clickId?:string}|null;metrics:{cpu:number;memory:number;history:number[]}|null;error:string;
 terminalId:string|null;terminalVersion:number;terminalChunks:string[];set:(patch:Partial<State>)=>void;receive:(event:{type:string;data:any})=>void;
}
export const useStudio=create<State>((set,get)=>({
 replyActivities:{},fault:{paused:false,incident:null},workspaceChanges:[],questions:[],browserInstall:{phase:'idle',progress:''},extensions:[],
 publicAccess:{phase:'stopped',url:'',error:'',startedAt:0,connections:0},remote:false,
 dsh:{installed:false,running:false,phase:'uninstalled',version:'0.2.1-rc.5',error:'',progress:'',url:''},apiModels:[],apiChats:{},
 platform:'',terminalShells:['default'],
 webchat:{provider:'chatgpt',providers:[],status:'打开 AI 网页并登录',busy:false},
 connected:false,connecting:true,mode:'safe',phase:'idle',view:'desktop',sidebar:true,settingsOpen:false,
 settings:{provider:'',model:'',baseUrl:'',apiKey:'',frameRate:1,theme:'dark',fontSize:14,detail:'standard',autoCollapse:true,mode:'safe',disabled:[],prompt:''},
 service:{phase:'stopped',url:'',localUrl:'',error:'',lastClient:'',clientAt:0,startedAt:0,localOnly:false},
 tools:[],calls:[],logs:[],history:[],messages:[],approvals:[],servers:[],frame:null,cursor:null,metrics:null,error:'',terminalId:null,terminalVersion:0,terminalChunks:[],set,
 receive:({type,data})=>{
  if(type==='client.reply-state'){set({replyActivities:{...get().replyActivities,[data.sessionId]:data}});return;}
  if(type==='runtime.fault'){const recovering=get().fault.paused&&!data.paused;set({fault:data,phase:'idle'});if(recovering)location.reload();return;}
  if(type==='harness.reload'){window.dispatchEvent(new Event('nexus:harness-reload'));return;}
  if(type==='workspace.change'){set({workspaceChanges:[...get().workspaceChanges.filter(c=>c.id!==data.id),data].slice(-100)});return;}
  if(type==='session.plan'){useSessionUI.getState().updateSessionId(data.sessionId,{plan:data.plan});return;}
  if(type==='question.upsert'){set({questions:get().questions.some(q=>q.id===data.id)?get().questions.map(q=>q.id===data.id?data:q):[...get().questions,data]});return;}
  if(type==='browser-install.state'){set({browserInstall:data});return;}
  if(type==='extensions.changed'){set({extensions:data});return;}
  if(type==='public-access.state'){set({publicAccess:data});return;}
  if(type==='dsh.state'){set({dsh:data});return;}
  if(type==='models.changed'){set({apiModels:data});return;}
  if(type==='chat.state'){set({apiChats:{...get().apiChats,[data.sessionId]:data}});return;}
  if(type==='client.failed'){if(data.sessionId===useSessionUI.getState().activeSessionId)set({error:data.error});return;}
  if((type==='tool.started'||type==='tool.finished')&&data.sessionId&&data.sessionId!==useSessionUI.getState().activeSessionId){const session=useSessionUI.getState().sessions.find(session=>session.id===data.sessionId);if(session){const calls=session.calls.some(call=>call.id===data.id)?session.calls.map(call=>call.id===data.id?{...call,...data}:call):[...session.calls,data];useSessionUI.getState().captureSession(session.id,session.messages,calls);}return;}
  if(type==='webchat.history'){
   const ui=useSessionUI.getState();
   if(data.sessionId===ui.activeSessionId)set({messages:data.messages});
   else{useSessionUI.setState({sessions:ui.sessions.map(session=>session.id===data.sessionId?{...session,messages:data.messages,updatedAt:Date.now()}:session)});}return;
  }
  if(type==='webchat.verification'){set({webchat:{...get().webchat,verification:data}});return;}
  if(type==='webchat.state'){data={...data,verification:get().webchat.verification};set({webchat:data,phase:data.busy?'executing':'idle'});return;}
  if(type==='message.upsert'){
   const ui=useSessionUI.getState();
   if(data.sessionId&&data.sessionId!==ui.activeSessionId){const target=ui.sessions.find(s=>s.id===data.sessionId);if(target){const messages=target.messages.some(m=>m.id===data.id)?target.messages.map(m=>m.id===data.id?data:m):[...target.messages,data];ui.captureSession(target.id,messages,target.calls);}return;}
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
