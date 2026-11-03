import {request} from './connection';

export type ExtensionKind='plugin'|'skill'|'mcp';
export interface ExtensionEntry {
  dsh?:{engines:string;runtimeName?:string;adapter?:string};
  studio?:{permissions:string[];frontend?:string;backend?:string;styles?:string};
  id:string;name:string;kind:ExtensionKind;description?:string;version?:string;
  enabled:boolean;status?:'installed'|'installing'|'error';error?:string;source?:string;
}
export interface InstallExtension {
  kind:ExtensionKind;
  name?:string;
  source:{type:'local'|'git'|'registry'|'mcp';value:string};
}
// 扩展能力集中在这个适配层，服务端可在不改界面的情况下对接自己的安装器。
export const extensionsApi={
  async list():Promise<ExtensionEntry[]>{
    const result=await request<ExtensionEntry[]|{items:ExtensionEntry[]}>('/extensions');
    const items=Array.isArray(result)?result:result.items;
    if(!Array.isArray(items))throw new Error('扩展列表格式无效');
    return items;
  },
  install:(body:InstallExtension)=>request<ExtensionEntry>('/extensions/install',body),
  enable:(id:string,enabled:boolean)=>request<ExtensionEntry>('/extensions/'+encodeURIComponent(id),{enabled},'PATCH'),
  remove:(id:string)=>request<void>('/extensions/'+encodeURIComponent(id),undefined,'DELETE'),
};
