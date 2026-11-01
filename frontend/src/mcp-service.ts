import {request} from './connection';
import {useStudio} from './store';
import type {ServiceState} from './types';

let starting:Promise<ServiceState>|null=null;
// 自动启动与手动弹窗共用同一个请求，避免同时创建两个临时隧道。
export function ensureMcpStarted():Promise<ServiceState>{
  if(starting)return starting;
  starting=(async()=>{
    const bootstrap=await request<{service:ServiceState}>('/bootstrap');
    const current=useStudio.getState().service;
    if(['running','starting','stopping'].includes(current.phase))return current;
    if(bootstrap.service&&['running','starting','stopping'].includes(bootstrap.service.phase)){useStudio.getState().set({service:bootstrap.service});return bootstrap.service;}
    const result=await request<ServiceState>('/service/start',{});
    if(result?.phase)useStudio.getState().set({service:result});
    return result;
  })().finally(()=>{starting=null;});
  return starting;
}
