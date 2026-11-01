import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export const replyInstructions = `客户端回复通道：当用户消息带有 NexusMCP requestId / sessionId 时，最终回答必须通过 client_reply 工具返回到软件，不依赖网页正文同步。把要给用户看的 Markdown 放在 text，填消息提供的 requestId 和 sessionId，最后一次调用 done=true。短回答一次调用即可；长回答可先 done=false，再 replace 或 append，最后 done=true。client_reply 成功表示客户端已接收文本，不代表电脑任务完成。无法确定本轮标识时先 client_session 查询；不能编造标识、串到旧会话或重复发送。`;
export class ClientReplies{
 constructor(directory,publish,onReply=()=>{}){this.file=path.join(directory,'client-replies.json');this.requests=[];this.publish=publish;this.onReply=onReply;this.activeSessionId='';this.persist=Promise.resolve();}
 async init(){try{const saved=JSON.parse(await fs.readFile(this.file,'utf8'));this.requests=Array.isArray(saved)?saved.slice(-100):[];for(const req of this.requests)if(['sending','waiting','replying'].includes(req.status))req.status='interrupted';}catch(e){if(e.code!=='ENOENT')throw e}}
 async save(){const snapshot=JSON.stringify(this.requests.slice(-100));this.persist=this.persist.catch(()=>{}).then(async()=>{const temp=this.file+'.tmp';await fs.writeFile(temp,snapshot,{mode:0o600});await fs.rename(temp,this.file)});return this.persist;}
 context(){return {replyTool:'client_reply',replyMode:'mcp',activeSessionId:this.activeSessionId,pending:this.requests.filter(r=>['sending','waiting','replying'].includes(r.status)).map(({requestId,sessionId,status,createdAt,provider})=>({requestId,sessionId,status,createdAt,provider})),instructions:replyInstructions};}
 async create(data){
  if(typeof data.sessionId!=='string'||!data.sessionId||data.sessionId.length>150)throw new Error('缺少有效的客户端 sessionId');
  if(this.requests.some(r=>r.sessionId===data.sessionId&&['sending','waiting','replying'].includes(r.status)))throw new Error('当前会话仍在等待 MCP 回复，请等待或停止');
  const req={requestId:randomUUID(),sessionId:data.sessionId,provider:data.provider||'chatgpt',createdAt:Date.now(),status:'sending',text:'',userText:data.text,sequence:0,lastOperation:''};this.activeSessionId=data.sessionId;this.requests.push(req);this.requests=this.requests.slice(-100);await this.save();return req;
 }
 async sent(req){if(req.status==='sending')req.status='waiting';await this.save();this.publish('message.upsert',{id:req.requestId+':user',role:'user',sessionId:req.sessionId,provider:req.provider,content:req.userText,requestId:req.requestId});this.publish('client.request',{requestId:req.requestId,sessionId:req.sessionId,status:req.status,replyMode:'mcp'});}
 async failed(req,error){if(req.status==='completed')return;req.status='failed';req.error=String(error.message||error);await this.save();this.publish('agent.status',{phase:'idle'});}
 async cancel(sessionId){for(const req of this.requests)if((!sessionId||req.sessionId===sessionId)&&['sending','waiting','replying'].includes(req.status))req.status='cancelled';await this.save();this.publish('agent.status',{phase:'idle'});}
 async receive(args){
  let req=args.requestId?this.requests.find(r=>r.requestId===args.requestId):null;
  if(!req){if(args.requestId)throw new Error('requestId 不存在，请 client_session 查询，不能把回复发到其他请求');const waiting=this.requests.filter(r=>['sending','waiting','replying'].includes(r.status)&&(!args.sessionId||r.sessionId===args.sessionId));if(waiting.length!==1)throw new Error('无法唯一确定回复目标，请 client_session 查询并指定 requestId');req=waiting[0];}
  if(args.sessionId&&req.sessionId!==args.sessionId)throw new Error('sessionId 与 requestId 不匹配，回复未发送');
  if(['cancelled','failed','interrupted'].includes(req.status))throw new Error('本轮请求已停止或中断，回复未发送');
  const mode=args.mode||'replace',done=args.done!==false,text=String(args.text||'');
  if(mode==='append'&&args.sequence===undefined)throw new Error('append 分段回复请填写递增 sequence，避免网络重试重复追加');
  const operation=JSON.stringify({mode,done,text,sequence:args.sequence});
  if(operation===req.lastOperation)return {received:true,duplicate:true,requestId:req.requestId,sessionId:req.sessionId,done:req.status==='completed',sequence:req.sequence};
  if(req.status==='completed'){if(mode==='replace'&&done&&text===req.text)return {received:true,duplicate:true,done:true,requestId:req.requestId,sessionId:req.sessionId,sequence:req.sequence};throw new Error('该请求已经完成，重复调用没有追加消息');}
  if(args.sequence!==undefined&&args.sequence!==req.sequence+1)throw new Error(`sequence 必须为 ${req.sequence+1}，防止重试导致重复追加`);
  const content=mode==='append'?req.text+text:text;if(!content.trim())throw new Error('回复正文不能为空');if(content.length>200000)throw new Error('回复累计超过 200000 字符');
  Object.assign(req,{text:content,status:done?'completed':'replying',updatedAt:Date.now(),sequence:req.sequence+1,lastOperation:operation});await this.save();
  const message={id:'mcp_'+req.requestId,role:'assistant',content,sessionId:req.sessionId,provider:req.provider,requestId:req.requestId,source:'MCP',done,sequence:req.sequence};
  this.publish('message.upsert',message);this.publish('client.reply',{...message,status:req.status});this.publish('agent.status',{phase:done?'idle':'executing'});this.onReply(message);
  return {received:true,requestId:req.requestId,sessionId:req.sessionId,done,sequence:req.sequence,characters:content.length};
 }
 messages(){return this.requests.filter(r=>r.text).map(r=>({id:'mcp_'+r.requestId,role:'assistant',content:r.text,sessionId:r.sessionId,provider:r.provider,requestId:r.requestId,source:'MCP',done:r.status==='completed'}));}
}
