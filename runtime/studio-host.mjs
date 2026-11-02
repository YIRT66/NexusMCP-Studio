import {pathToFileURL} from 'node:url';
import {promises as fs} from 'node:fs';
import path from 'node:path';
export class StudioHost {
  constructor(api){this.api=api;this.active=new Map();this.tools=new Map();this.hooks=new Map();}
  async activate(entry,base){
    if(!entry.studio)return;
    await this.deactivate(entry.id);
    const disposers=[];const record={base,entry,disposers};this.active.set(entry.id,record);
    if(!entry.studio.backend)return;
    const url=pathToFileURL(path.join(base,entry.studio.backend));url.searchParams.set('generation',String(Date.now()));
    try{
      const module=await import(url.href);if(this.active.get(entry.id)!==record)return;if(typeof module.activate!=='function')throw new Error('Studio 后端入口需导出 activate(api)');
      const api={...this.api,id:entry.id,directory:base,callTool:(name,args)=>this.api.callTool(name,args,{extensionId:entry.id}),
        registerTool:(definition,handler)=>{if(this.active.get(entry.id)!==record)throw new Error('扩展已停止');if(!/^[\w-]{1,50}$/.test(definition.name)||typeof handler!=='function')throw new Error('扩展工具定义无效');const name='studio_'+entry.id.slice(0,8)+'_'+definition.name;this.tools.set(name,{...definition,name,extensionId:entry.id,handler,description:definition.description||definition.name,inputSchema:definition.inputSchema||{type:'object',properties:{}}});disposers.push(()=>this.tools.delete(name));return name;},
        useToolMiddleware:hook=>{if(this.active.get(entry.id)!==record)throw new Error('扩展已停止');if(!hook||!['beforeTool','afterTool'].some(key=>typeof hook[key]==='function'))throw new Error('工具中间件无效');this.hooks.set(entry.id,hook);disposers.push(()=>this.hooks.delete(entry.id));},
      };
      const cleanup=await module.activate(api);if(this.active.get(entry.id)!==record){if(typeof cleanup==='function')await cleanup();return;}if(typeof cleanup==='function')disposers.push(cleanup);
    }catch(error){await this.deactivate(entry.id);throw error;}
  }
  async deactivate(id){const active=this.active.get(id);if(!active)return;this.active.delete(id);for(const dispose of active.disposers.reverse())try{await dispose();}catch(error){this.api.emit('extension.log',{id,text:'扩展清理：'+error.message});}}
  manifest(){return [...this.tools.values()].map(({handler,...definition})=>definition);}
  async call(name,args){const tool=this.tools.get(name);if(!tool)throw new Error('Studio 工具未启用');return tool.handler(args);}
  async invoke(call,next){
    const hooks=[...this.hooks].filter(([id])=>id!==call.extensionId);
    let current={...call};
    for(const [,hook]of hooks)if(hook.beforeTool){const patch=await hook.beforeTool(Object.freeze({...current}));if(patch)current={...current,...patch};}
    let result=await next(current);
    for(const [,hook]of hooks.slice().reverse())if(hook.afterTool){const replacement=await hook.afterTool(Object.freeze({...current}),result);if(replacement!==undefined)result=replacement;}
    return result;
  }
  async asset(entry,relative){const active=this.active.get(entry.id);if(!active||!entry.enabled||entry.status!=='installed')throw new Error('扩展未启用');const real=await fs.realpath(path.resolve(active.base,relative));const rel=path.relative(active.base,real);if(rel.startsWith('..')||path.isAbsolute(rel))throw new Error('扩展资源越界');return real;}
}
