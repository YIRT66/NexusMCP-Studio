import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readText,writeText,patchText,fileHash} from './files.mjs';
const ignored=new Set(['node_modules','.git','dist','build','release','.venv','venv','__pycache__','.next','target','.cache']);
const binary=/\.(?:png|jpe?g|gif|webp|ico|pdf|zip|gz|7z|exe|dll|so|woff2?|ttf|mp[34]|sqlite|db|lock)$/i;
const trees=new Map();
export async function workspaceRead({path:root,cursor=0,maxFiles=60,maxBytes=512000,maxFileBytes=32000,maxDepth=15,includeHidden=false}){
  root=await fs.realpath(root);
  const cacheKey=root+'\0'+maxDepth+'\0'+includeHidden;
  let tree=trees.get(cacheKey);
  if(!tree||Date.now()-tree.at>2000){
    const paths=[],queue=[{dir:root,depth:0}];let visited=0,limited=false;
    outer:for(let head=0;head<queue.length;head++){
      const {dir,depth}=queue[head];let entries;try{entries=await fs.readdir(dir,{withFileTypes:true});}catch{continue;}
      entries.sort((a,b)=>a.name.localeCompare(b.name));
      for(const entry of entries){if(++visited>30000){limited=true;break outer;}if(ignored.has(entry.name)||!includeHidden&&entry.name.startsWith('.'))continue;const file=path.join(dir,entry.name);if(entry.isDirectory()&&depth<maxDepth)queue.push({dir:file,depth:depth+1});else if(entry.isFile()&&!binary.test(entry.name))paths.push(file);}
    }
    tree={paths:paths.sort(),at:Date.now(),limited,revision:createHash('sha256').update(paths.join('\n')).digest('hex').slice(0,16)};
    trees.set(cacheKey,tree);if(trees.size>16)trees.delete(trees.keys().next().value);
  }
  const files=[],errors=[];let used=0,index=cursor;
  // Read only a bounded set; preserve ordering and stop before the next page.
  while(index<tree.paths.length&&files.length<maxFiles&&used<maxBytes){
    const batch=tree.paths.slice(index,index+Math.min(4,maxFiles-files.length));
    const pageStart=index,allowance=Math.min(maxFileBytes,maxBytes);
    const read=await Promise.all(batch.map(async file=>{try{
      const stat=await fs.stat(file);let text;
      if(stat.size<=allowance){const content=await fs.readFile(file,'utf8');text={path:file,text:content,hash:fileHash(content),truncated:false,nextLine:null};}
      else text=await readText(file,{maxLines:2000,maxBytes:allowance});
      if(text.text.includes('\0'))return {skip:true,path:file};return text;
    }catch(error){return {path:file,error:error.message};}}));
    for(const item of read){if(item.error){errors.push({path:item.path,error:item.error});index++;continue;}if(item.skip){index++;continue;}const bytes=Buffer.byteLength(item.text);if(used+bytes>maxBytes)break;used+=bytes;files.push({...item,path:path.relative(root,item.path)});index++;}
    if(index<pageStart+batch.length||used>=maxBytes)break;
    if(batch.length&&!read.some(item=>item.text?.length)&&index>=tree.paths.length)break;
  }
  return {root,revision:tree.revision,totalFiles:tree.paths.length,files,errors,bytes:used,nextCursor:index<tree.paths.length?index:null,truncated:index<tree.paths.length||tree.limited,treeTruncated:tree.limited,excluded:[...ignored],hint:'nextCursor 继续读取；文件 truncated=true 时用 file_read 按 nextLine 继续。'};
}
export async function workspaceBatch({steps,stopOnError=true}){
  const results=[];
  for(let index=0;index<steps.length;index++){
    const step=steps[index];
    try{
      let result;
      if(step.action==='read')result=await readText(step.path,step);
      else if(step.action==='write')result=await writeText(step.path,step.content,step.expectedHash);
      else if(step.action==='patch')result=await patchText(step.path,step.edits,step.expectedHash);
      else if(step.action==='mkdir'){await fs.mkdir(step.path,{recursive:true});result={ok:true};}
      else if(step.action==='list')result=(await fs.readdir(step.path,{withFileTypes:true})).slice(0,500).map(entry=>({name:entry.name,directory:entry.isDirectory()}));
      else throw new Error('不支持此批量操作');
      results.push({index,action:step.action,path:step.path,ok:true,result});
    }catch(error){results.push({index,action:step.action,path:step.path,ok:false,error:error.message});if(stopOnError)break;}
  }
  return {ok:results.every(r=>r.ok),completed:results.length,total:steps.length,results};
}
