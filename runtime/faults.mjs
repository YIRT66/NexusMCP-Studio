import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export const redact=value=>String(value).replace(/(Bearer\s+)[^\s"']+/gi,'$1[已隐藏]').replace(/([?&](?:token|key|auth|secret)=)[^\s&#"']+/gi,'$1[已隐藏]').replace(/("?(?:apiKey|password|accessToken)"?\s*[:=]\s*")[^"]*/gi,'$1[已隐藏]');
export class Faults {
 constructor(directory,publish=()=>{}){this.directory=path.join(directory,'logs');this.file=path.join(directory,'runtime-fault.json');this.publish=publish;this.state={paused:false,incident:null};this.queue=Promise.resolve();}
 async init(){await fs.mkdir(this.directory,{recursive:true});try{this.state=JSON.parse(await fs.readFile(this.file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}}
 snapshot(){return this.state;}
 log(source,value){const line=JSON.stringify({at:new Date().toISOString(),source,text:redact(value).slice(-32000)})+'\n',file=path.join(this.directory,source==='guardian'?'process.jsonl':'runtime.jsonl');this.queue=this.queue.catch(()=>{}).then(async()=>{if((await fs.stat(file).catch(()=>null))?.size>8*1024*1024){await fs.rm(file+'.1',{force:true});await fs.rename(file,file+'.1');}await fs.appendFile(file,line,{mode:0o600});});return this.queue;}
 async report(error,source='runtime') {if(this.state.paused)return this.state;const incident={id:randomUUID(),at:new Date().toISOString(),source,message:redact(error?.message||error),stack:redact(error?.stack||error).slice(-32000),pid:process.pid,node:process.version,platform:process.platform,logDirectory:this.directory};this.state={paused:true,incident};this.publish('runtime.fault',this.state);await this.log(source,incident.stack);await this.save();return this.state;}
 async save(){const temp=this.file+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,JSON.stringify(this.state),{mode:0o600});await fs.rename(temp,this.file);}
 async recover(){await this.log('runtime','用户手动解除故障暂停；任务不会自动重放');this.state={paused:false,incident:null};await this.save();this.publish('runtime.fault',this.state);return this.state;}
 async logs(){const values=[];await this.queue;for(const name of ['runtime.jsonl','process.jsonl']){const file=await fs.open(path.join(this.directory,name),'r').catch(()=>null);if(!file)continue;try{const stat=await file.stat(),size=Math.min(stat.size,160000),buffer=Buffer.alloc(size);await file.read(buffer,0,size,stat.size-size);values.push(name+'\n'+buffer.toString());}finally{await file.close();}}return values.join('\n\n');}
}
