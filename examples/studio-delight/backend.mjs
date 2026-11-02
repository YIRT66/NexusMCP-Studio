export function activate(api){
 let calls=0;const started=Date.now();
 api.registerTool({name:'workspace_pulse',description:'读取工作搭子的实际运行时统计',inputSchema:{type:'object',properties:{}}},async()=>({content:[{type:'text',text:JSON.stringify({calls,uptimeMs:Date.now()-started})}]}));
 api.useToolMiddleware({beforeTool(){calls++;},afterTool(call,result){api.emit('plugin.event',{extensionId:api.id,tool:call.name,isError:!!result?.isError});}});
 return()=>api.emit('extension.log',{id:api.id,text:'工作搭子运行时已停用'});
}
