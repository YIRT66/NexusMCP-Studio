import {randomUUID} from 'node:crypto';
let configuration={tools:[],skills:[]};
const pending=new Map();
export function configureExtensions(next){configuration={tools:Array.isArray(next?.tools)?next.tools:[],skills:Array.isArray(next?.skills)?next.skills:[]};}
export const extensionConfiguration=()=>configuration;
export function resolveExtension(message){const p=pending.get(message.id);if(!p)return;pending.delete(message.id);clearTimeout(p.timer);message.error?p.reject(new Error(message.error)):p.resolve(message.result);}
export function cancelExtensions(){for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('MCP 服务已停止'))}pending.clear();}
export function extensionRequest(operation,name,args){
 if(!process.send||!process.connected)return Promise.reject(new Error('外接扩展需要从 NexusMCP 客户端运行时启动'));
 if(pending.size>=8)return Promise.reject(new Error('扩展并发调用过多'));
 const id=randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error('扩展调用超时'))},120000);pending.set(id,{resolve,reject,timer});process.send({type:'extension.call',id,operation,name,args});});
}
