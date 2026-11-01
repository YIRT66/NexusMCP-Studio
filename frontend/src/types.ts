export type Mode = 'safe' | 'overdrive';
export type View = 'desktop' | 'terminal' | 'explorer';
export type Phase = 'idle' | 'thinking' | 'executing' | 'stopping';
export interface Settings {provider:string;model:string;baseUrl:string;apiKey:string;frameRate:number;theme:'dark'|'light'|'system';fontSize:number;detail:'standard'|'expanded';autoCollapse:boolean;mode:Mode;disabled:string[];prompt:string}
export interface ServiceState {phase:'stopped'|'starting'|'running'|'stopping'|'error';url:string;localUrl:string;error:string;lastClient:string;clientAt:number;startedAt:number;localOnly:boolean}
export interface ServiceLog {id:string;at:number;text:string}
export interface HistoryEntry {id:string;startedAt:number;label:string}
export interface Tool {name:string;description:string;group:string;enabled:boolean;calls:number;running:boolean}
export interface ToolCall {id:string;name:string;source?:string;input:unknown;output?:unknown;status:'running'|'completed'|'error';startedAt:number;endedAt?:number}
export interface Message {id:string;role:'user'|'assistant';content:string;provider?:string;sessionId?:string}
export interface WebchatState {provider:string;providers:{id:string;name:string;url:string}[];status:string;sessionId?:string;url?:string;visible?:boolean;busy:boolean;transport?:'embedded'|'extension';ready?:boolean;replyMode?:'mcp';requestId?:string}
export interface Approval {id:string;title:string;description:string;expiresAt:number}
export interface Frame {data:string;width:number;height:number;x:number;y:number;timestamp:number}
export interface FileEntry {name:string;path:string;directory:boolean;size?:number}
export interface ProcessEntry {pid:number;name:string;cpu:number;memory:number}
export interface ServerEntry {id:string;name:string;url:string;connected:boolean;tools:number}
export interface WireEvent {type:string;seq?:number;data:Record<string,unknown>}
