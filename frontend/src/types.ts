export type Mode = 'safe' | 'overdrive';
export type View = 'desktop' | 'terminal' | 'explorer';
export type Phase = 'idle' | 'thinking' | 'executing' | 'stopping'|'waiting-user';
export interface Settings {autoInstallBrowser?:boolean;autoInstallPlugins?:boolean;elevated?:boolean;provider:string;model:string;baseUrl:string;apiKey:string;frameRate:number;theme:'dark'|'light'|'system';fontSize:number;detail:'standard'|'expanded';autoCollapse:boolean;mode:Mode;disabled:string[];prompt:string}
export interface ServiceState {privilege?:'root'|'user';phase:'stopped'|'starting'|'running'|'stopping'|'error';url:string;localUrl:string;error:string;lastClient:string;clientAt:number;startedAt:number;localOnly:boolean}
export interface ServiceLog {id:string;at:number;text:string}
export interface HistoryEntry {id:string;startedAt:number;label:string}
export interface Tool {name:string;description:string;group:string;enabled:boolean;calls:number;running:boolean}
export interface ToolCall {requestId?:string;sessionId?:string;id:string;name:string;source?:string;input:unknown;output?:unknown;status:'running'|'completed'|'error';startedAt:number;endedAt?:number}
export interface Message {reasoning?:string;reasoningStatus?:string;reasoningStartedAt?:number;reasoningCompletedAt?:number;purpose?:string;reasoningEffort?:string;requestId?:string;source?:string;model?:string;createdAt?:number;firstTokenAt?:number;requestStartedAt?:number;completedAt?:number;updatedAt?:number;status?:string;done?:boolean;usage?:{prompt_tokens?:number;completion_tokens?:number;total_tokens?:number};id:string;role:'user'|'assistant';content:string;provider?:string;sessionId?:string}
export interface WebchatState {startedAt?:number;thinkingEnabled?:boolean;verification?:{phase:string;step:number;error?:string;verifiedAt?:number};provider:string;providers:{id:string;name:string;url:string}[];status:string;sessionId?:string;url?:string;visible?:boolean;busy:boolean;transport?:'embedded'|'extension';ready?:boolean;pageBusy?:boolean;replyMode?:'mcp';requestId?:string}
export interface Approval {id:string;title:string;description:string;expiresAt:number}
export interface Frame {data:string;width:number;height:number;x:number;y:number;timestamp:number}
export interface FileEntry {name:string;path:string;directory:boolean;size?:number}
export interface ProcessEntry {pid:number;name:string;cpu:number;memory:number}
export interface ServerEntry {id:string;name:string;url:string;connected:boolean;tools:number}
export interface WireEvent {type:string;seq?:number;data:Record<string,unknown>}

export interface ApiModelProfile {reasoningMode?:string;reasoning?:{mode:string;efforts:string[]};id:string;name:string;provider:string;model:string;baseUrl:string;keyConfigured:boolean}
export interface ApiChatState {startedAt?:number;sessionId:string;mode:'api';busy:boolean;phase:Phase;status:string;error?:string;requestId?:string;profileId?:string}

export interface DshState {installed:boolean;running:boolean;phase:string;version:string;error:string;progress:string;url:string}
export interface PublicAccessState {phase:'stopped'|'starting'|'running'|'error';url:string;error:string;startedAt:number;connections:number}

export interface UserQuestionSet {id:string;sessionId:string;requestId:string;status:"pending"|"answered"|"cancelled";questions:{id:string;question:string;options?:{label:string;description?:string}[]}[];answers?:Record<string,string>;createdAt:number}

export interface ReplyActivity {sessionId:string;requestId:string;startedAt:number;completedAt?:number;busy:boolean;status:string;external:boolean}
