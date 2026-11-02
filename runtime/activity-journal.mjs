import { promises as fs } from 'node:fs';
export class ActivityJournal {
  constructor(file,onError=()=>{}) { this.file=file;this.onError=onError;this.buffer=[];this.queue=Promise.resolve();this.size=null;this.timer=null; }
  append(call) {
    this.buffer.push(JSON.stringify(call)+'\n');
    if(this.buffer.length>=32)void this.flush();
    else if(!this.timer)this.timer=setTimeout(()=>void this.flush(),40);
  }
  flush() {
    clearTimeout(this.timer);this.timer=null;
    const batch=this.buffer.splice(0).join('');
    if(!batch)return this.queue;
    this.queue=this.queue.catch(()=>{}).then(async()=>{
      if(this.size===null)this.size=await fs.stat(this.file).then(s=>s.size,error=>{if(error.code==='ENOENT')return 0;throw error;});
      if(this.size>8*1024*1024){await fs.rm(this.file+'.1',{force:true});await fs.rename(this.file,this.file+'.1');this.size=0;}
      await fs.appendFile(this.file,batch,{mode:0o600});this.size+=Buffer.byteLength(batch);
    }).catch(error=>{this.size=null;this.onError(error);});
    return this.queue;
  }
}
