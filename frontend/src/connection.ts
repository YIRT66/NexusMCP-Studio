import {useSessionUI} from './session-ui';
import {useStudio} from './store';
let socket:WebSocket|null=null;
export async function request<T>(path:string,body?:unknown,method?:string):Promise<T>{
 const response=await fetch('/api'+path,{method:method||(body===undefined?'GET':'POST'),headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 if(!response.ok){const error=await response.json().catch(()=>({error:`HTTP ${response.status}`}));throw new Error(error.detail||error.error||'本机请求失败')}
 if(response.status===204)return undefined as T;return response.json();
}
export function send(type:string,data:unknown={}){if(socket?.readyState!==WebSocket.OPEN)throw new Error('本地控制台尚未连接，请先启动 NexusMCP Studio。');socket.send(JSON.stringify({type,id:crypto.randomUUID(),data}))}
export function connect(){
 let stopped=false,attempts=0,timer:ReturnType<typeof setTimeout>|undefined,current:WebSocket|null=null;
 const start=async()=>{
  if(stopped)return;useStudio.getState().set({connecting:true});let runtime:string|null=null;try{runtime=await window.nexusDesktop?.getRuntimeURL?.()||null}catch{}if(stopped)return;const ws=new WebSocket(location.protocol==='nexus:'&&runtime?runtime.replace('http:','ws:')+'/ws':`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);current=ws;socket=ws;
  ws.onopen=async()=>{attempts=0;useStudio.getState().set({connected:true,connecting:false,error:''});try{const data=await request<any>('/bootstrap');if(stopped)return;const scopedCalls=(data.calls||[]).filter((c:any)=>!c.sessionId||c.sessionId===useSessionUI.getState().activeSessionId);useStudio.getState().set({...data,calls:scopedCalls,settings:{...useStudio.getState().settings,...data.settings}});for(const message of data.clientReplies||[])useStudio.getState().receive({type:'message.upsert',data:message})}catch(e){useStudio.getState().set({error:(e as Error).message})}};
  ws.onmessage=e=>{try{const event=JSON.parse(e.data);if(typeof event.type==='string'&&event.data!==undefined)useStudio.getState().receive(event)}catch{useStudio.getState().set({error:'本地运行时发送了无效事件'})}};
  ws.onclose=()=>{if(stopped)return;useStudio.getState().set({connected:false,connecting:false,frame:null,cursor:null});timer=setTimeout(start,Math.min(20000,1000*2**attempts++))};
 };start();return()=>{stopped=true;clearTimeout(timer);current?.close();if(socket===current)socket=null};
}
export function act(type:string,data:unknown={}){try{send(type,data)}catch(e){useStudio.getState().set({error:(e as Error).message})}}
