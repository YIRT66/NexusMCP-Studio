import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
export class UserQuestions {
 constructor(directory,publish=()=>{}){this.file=path.join(directory,'user-questions.json');this.publish=publish;this.items=[];this.waiters=new Map();this.queue=Promise.resolve();}
 async init(){try{this.items=JSON.parse(await fs.readFile(this.file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}}
 async save(){const snapshot=JSON.stringify(this.items);this.queue=this.queue.catch(()=>{}).then(async()=>{await fs.writeFile(this.file+'.tmp',snapshot,{mode:0o600});await fs.rename(this.file+'.tmp',this.file);});await this.queue;}
 pending(sessionId){return this.items.filter(q=>q.status==='pending'&&(!sessionId||q.sessionId===sessionId));}
 async create({sessionId,requestId,questions}){
  if(!sessionId||!requestId)throw new Error('提问需要有效的会话与请求');
  if(!Array.isArray(questions)||questions.length<1||questions.length>3)throw new Error('一次支持 1–3 个问题');
  const ids=new Set();for(const question of questions){if(typeof question.id!=='string'||!/^[\w-]{1,60}$/.test(question.id)||ids.has(question.id)||typeof question.question!=='string'||!question.question.trim()||question.question.length>2000)throw new Error('问题标识或内容无效');ids.add(question.id);if(question.options!==undefined&&(!Array.isArray(question.options)||question.options.length<2||question.options.length>4||question.options.some(o=>typeof o.label!=='string'||!o.label.trim()||o.label.length>150||typeof o.description!=='undefined'&&typeof o.description!=='string')))throw new Error('每题支持 2–4 个选项，也可以只填写文字');}
  const fingerprint=createHash('sha256').update(JSON.stringify([requestId,questions])).digest('hex');const prior=this.items.find(q=>q.fingerprint===fingerprint);if(prior)return prior;
  const item={id:randomUUID(),sessionId,requestId,questions,status:'pending',createdAt:Date.now(),fingerprint};this.items.push(item);await this.save();this.publish('question.upsert',item);return item;
 }
 async answer(id,answers,{cancelled=false,stopped=false}={}){const item=this.items.find(q=>q.id===id);if(!item)throw new Error('问题不存在');if(item.status!=='pending')return item;if(!cancelled){for(const question of item.questions){const answer=answers?.[question.id];if(typeof answer!=='string'||!answer.trim()||answer.length>10000)throw new Error('请回答全部问题或取消');}}Object.assign(item,{status:cancelled?'cancelled':'answered',answers:cancelled?{}:answers,stopped,answeredAt:Date.now()});await this.save();this.publish('question.upsert',item);for(const resolve of this.waiters.get(id)||[])resolve(item);this.waiters.delete(id);return item;}
 wait(id,signal){const item=this.items.find(q=>q.id===id);if(!item)return Promise.reject(new Error('问题不存在'));if(item.status!=='pending')return Promise.resolve(item);return new Promise((resolve,reject)=>{const finish=value=>{signal?.removeEventListener('abort',abort);this.waiters.get(id)?.delete(finish);resolve(value);};const abort=()=>{this.waiters.get(id)?.delete(finish);reject(new Error('提问等待已停止'));};if(signal?.aborted)return abort();if(!this.waiters.has(id))this.waiters.set(id,new Set());this.waiters.get(id).add(finish);signal?.addEventListener('abort',abort,{once:true});});}
 async cancel(sessionId){for(const item of this.pending(sessionId))await this.answer(item.id,{}, {cancelled:true,stopped:true});}
}
