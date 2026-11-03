import {watch} from 'node:fs';
import {promises as fs} from 'node:fs';
import path from 'node:path';
const ignored=new Set(['.git','node_modules','dist','build','.cache','.venv','__pycache__']);
export class WorkspaceWatch {
 constructor(publish){this.publish=publish;this.watchers=new Map();this.changes=[];this.pending=new Map();this.closed=false;}
 attach(workspace){if(this.closed||!workspace)return Promise.resolve();if(this.pending.has(workspace))return this.pending.get(workspace);const operation=this.start(workspace).finally(()=>this.pending.delete(workspace));this.pending.set(workspace,operation);return operation;}
 async start(workspace){if(!workspace||this.watchers.has(workspace))return;const root=await fs.realpath(workspace);const known=new Set(),directories=[root];let count=0,complete=true;while(directories.length){const directory=directories.shift();for(const entry of await fs.readdir(directory,{withFileTypes:true}).catch(()=>[])){if(ignored.has(entry.name))continue;if(++count>10000){complete=false;directories.length=0;break;}const file=path.join(directory,entry.name);known.add(file);if(entry.isDirectory())directories.push(file);}}
  if(this.closed)return;while(this.watchers.size>=3){const [id,value]=this.watchers.entries().next().value;value.watcher.close();for(const timer of value.timers.values())clearTimeout(timer);this.watchers.delete(id);}
  const timers=new Map();let watcher;try{watcher=watch(root,{recursive:true},(_event,name)=>{if(!name||String(name).split(/[\\/]/).some(part=>ignored.has(part)||part.startsWith('.nexus-')))return;const file=path.resolve(root,String(name));if(path.relative(root,file).startsWith('..'))return;clearTimeout(timers.get(file));timers.set(file,setTimeout(async()=>{timers.delete(file);const stat=await fs.stat(file).catch(()=>null),existed=known.has(file);if(stat?.isDirectory()){known.add(file);return;}if(stat)known.add(file);else known.delete(file);const operation=!stat?'deleted':existed||!complete?'modified':'created';const change={id:workspace+':'+file,workspace,path:file,operation,source:'workspace',at:Date.now()};this.changes=[...this.changes.filter(c=>c.id!==change.id),change].slice(-100);this.publish('workspace.change',change);},180));});watcher.on('error',()=>{});}catch{return;}this.watchers.set(workspace,{watcher,timers});
 }
 close(){this.closed=true;for(const {watcher,timers} of this.watchers.values()){watcher.close();for(const timer of timers.values())clearTimeout(timer);}this.watchers.clear();}
}
