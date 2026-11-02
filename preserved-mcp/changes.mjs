import {diffLines} from 'diff';
export function fileChanges(before,after,path){
  if(before===after)return {path,addedLines:0,removedLines:0,lines:[],truncated:false};
  const parts=diffLines(before,after,{timeout:80,maxEditLength:5000});
  if(!parts)return {path,addedLines:after.split('\n').length,removedLines:before.split('\n').length,approximate:true,lines:[],truncated:true};
  let addedLines=0,removedLines=0;const lines=[];
  for(const part of parts){if(part.added)addedLines+=part.count;if(part.removed)removedLines+=part.count;if(part.added||part.removed)for(const text of part.value.replace(/\n$/,'').split('\n'))if(lines.length<60)lines.push({kind:part.added?'added':'removed',text:text.slice(0,180)});}
  return {path,addedLines,removedLines,lines,truncated:addedLines+removedLines>lines.length};
}
