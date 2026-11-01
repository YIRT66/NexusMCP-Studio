/* Shared CDP controller for the managed browser, Electron and the optional Chrome debugger. */
(function(root){
 const secret=/password|passwd|authorization|cookie|api.?key|access.?token|secret/i;
 function preview(value){
  if(value.type==='object'&&value.preview){return Object.fromEntries((value.preview.properties||[]).slice(0,30).map(p=>[p.name,secret.test(p.name)?'[redacted]':String(p.value??p.type).slice(0,1500)]));}
  return value.value??value.unserializableValue??value.description??value.type;
 }
 class NexusDebugController{
  constructor(send){this.send=send;this.entries=[];this.sequence=0;this.scripts=new Map();this.paused=false;}
  event(method,data={}){
   if(method==='Debugger.paused')this.paused=true;
   if(method==='Debugger.resumed')this.paused=false;
   let entry;
   if(method==='Runtime.consoleAPICalled')entry={level:data.type||'log',values:(data.args||[]).map(preview),timestamp:data.timestamp||Date.now()};
   if(method==='Runtime.exceptionThrown')entry={level:'error',values:[data.exceptionDetails?.exception?.description||data.exceptionDetails?.text||'页面异常'],timestamp:data.timestamp||Date.now()};
   if(entry){this.entries.push({...entry,id:++this.sequence});if(this.entries.length>500)this.entries.shift();}
  }
  async enable(){await this.send('Runtime.enable');await this.send('Page.enable');return this;}
  async evaluate(code){
   if(typeof code!=='string'||!code.trim()||code.length>100000)throw new Error('脚本需为 1–100000 字符');
   const result=await this.send('Runtime.evaluate',{expression:code,awaitPromise:true,returnByValue:true,replMode:true,timeout:10000});
   if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text||'脚本执行失败');
   return {value:preview(result.result||{}),type:result.result?.type};
  }
  async dispatch({operation='read',code,kind='js',persistent=false,injectionId,cursor=0,limit=100}={}){
   if(operation==='read')return {entries:this.entries.filter(e=>e.id>cursor).slice(0,Math.min(300,limit)),nextCursor:this.sequence,oldestCursor:this.entries[0]?.id||this.sequence,paused:this.paused,injections:[...this.scripts].map(([id,s])=>({id,kind:s.kind,persistent:!!s.identifier}))};
   if(operation==='clear'){this.entries=[];await this.send('Runtime.discardConsoleEntries');return {ok:true,nextCursor:this.sequence};}
   if(operation==='execute')return this.evaluate(code);
   if(operation==='pause'){await this.send('Debugger.enable');await this.send('Debugger.pause');return {ok:true,paused:this.paused,pauseRequested:true};}
   if(operation==='resume'){await this.send('Debugger.resume');return {ok:true,paused:false};}
   if(operation==='terminate'){await this.send('Runtime.terminateExecution');return {ok:true};}
   if(operation==='inject'){
    if(typeof code!=='string'||!code.trim()||code.length>100000)throw new Error('注入内容需为 1–100000 字符');
    const id='nexus-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
    const source=kind==='css'?`(()=>{const s=document.createElement('style');s.id=${JSON.stringify(id)};s.textContent=${JSON.stringify(code)};(document.head||document.documentElement).appendChild(s)})()`:code;
    let identifier;
    if(persistent)identifier=(await this.send('Page.addScriptToEvaluateOnNewDocument',{source})).identifier;
    try{const result=await this.evaluate(source);this.scripts.set(id,{kind,identifier});return {id,persistent,result,note:kind==='js'?'移除只停止后续导航注入；已执行脚本的副作用需要脚本自行清理。':undefined};}
    catch(error){if(identifier)await this.send('Page.removeScriptToEvaluateOnNewDocument',{identifier}).catch(()=>{});throw error;}
   }
   if(operation==='remove'){
    const script=this.scripts.get(injectionId);if(!script)throw new Error('注入 ID 不存在或调试连接已重建');
    if(script.identifier)await this.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:script.identifier});
    if(script.kind==='css')await this.evaluate(`document.getElementById(${JSON.stringify(injectionId)})?.remove()`);
    this.scripts.delete(injectionId);return {ok:true};
   }
   throw new Error('未知调试操作');
  }
 }
 root.NexusDebugController=NexusDebugController;
 if(typeof module==='object')module.exports={NexusDebugController};
})(globalThis);
