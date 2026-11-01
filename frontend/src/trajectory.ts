import type {Message,ToolCall} from './types';
export interface TrajectoryRecord {id:string;kind:'user'|'assistant'|'tool';label:string;preview:string;search:string;at:number|null;end:number|null;firstTokenAt:number|null;status:'running'|'completed'|'error'|'interrupted';requestId?:string;message?:Message;call?:ToolCall}
export interface TrajectoryTurn {id:string;label:string;records:TrajectoryRecord[]}
const timestamp=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
const stringify=(value:unknown)=>typeof value==='string'?value:JSON.stringify(value,null,2)||'';
export function trajectoryRecords(messages:Message[],calls:ToolCall[],timeline:{id:string;kind:'message'|'tool';at:number}[]):TrajectoryRecord[]{
 const recorded=new Map(timeline.map((entry,index)=>[entry.kind+':'+entry.id,{at:timestamp(entry.at),index}]));
 const records:TrajectoryRecord[]=[...messages.map(message=>{const at=timestamp(message.createdAt)??recorded.get('message:'+message.id)?.at??null;return {id:message.id,kind:message.role,label:message.role==='user'?'用户输入':message.model||'助手回复',preview:message.content.replace(/\s+/g,' ').slice(0,160),search:message.content.toLowerCase(),at,end:timestamp(message.completedAt),firstTokenAt:timestamp(message.firstTokenAt),status:['failed','error'].includes(message.status||'')?'error':['cancelled','interrupted'].includes(message.status||'')?'interrupted':message.done===false?'running':'completed',requestId:message.requestId,message} as TrajectoryRecord;}),...calls.map(call=>({id:call.id,kind:'tool' as const,label:call.name,preview:stringify(call.input).replace(/\s+/g,' ').slice(0,160),search:(call.name+' '+stringify(call.input)+' '+stringify(call.output)).toLowerCase(),at:timestamp(call.startedAt),end:timestamp(call.endedAt),firstTokenAt:null,status:call.status,requestId:call.requestId,call}))];
 return records.map((record,index)=>({record,index:recorded.get((record.call?'tool':'message')+':'+record.id)?.index??timeline.length+index})).sort((a,b)=>a.record.at!==null&&b.record.at!==null?a.record.at-b.record.at||a.index-b.index:a.index-b.index).map(value=>value.record);
}
export function trajectoryTurns(records:TrajectoryRecord[]):TrajectoryTurn[]{
 const turns:TrajectoryTurn[]=[],requests=new Map<string,TrajectoryTurn>();let current:TrajectoryTurn|undefined;
 for(const record of records){
  if(record.kind==='user'){current={id:record.id,label:record.message?.content.replace(/\s+/g,' ').slice(0,75)||'用户输入',records:[]};turns.push(current);if(record.requestId)requests.set(record.requestId,current);}
  const target=record.requestId?requests.get(record.requestId)||current:current;
  if(target)target.records.push(record);else{let local=turns.find(turn=>turn.id==='local');if(!local){local={id:'local',label:'本机操作',records:[]};turns.push(local);}local.records.push(record);}
 }
 return turns;
}
export function projectTrajectory(records:TrajectoryRecord[],mode:'clock'|'duration'|'steps'){
 const times=records.flatMap(record=>[record.at,record.end].filter((time):time is number=>time!==null));
 const start=times.length?Math.min(...times):0,end=times.length?Math.max(...times):0,span=Math.max(1,end-start);
 const covered=records.filter(record=>record.at!==null).map(record=>[record.at!,Math.max(record.at!,record.end??record.at!)]).sort((a,b)=>a[0]-b[0]);
 const merged:number[][]=[];for(const interval of covered){const prior=merged.at(-1);if(prior&&interval[0]<=prior[1])prior[1]=Math.max(prior[1],interval[1]);else merged.push([...interval]);}
 const gaps=merged.slice(1).map((interval,index)=>({left:merged[index][1],right:interval[0]}));
 const compressed=(time:number)=>time-start-gaps.reduce((removed,gap)=>removed+Math.max(0,Math.min(time,gap.right)-gap.left)*Math.max(0,1-100/(gap.right-gap.left)),0);
 const compressedSpan=Math.max(1,compressed(end));
 let cursor=0;
 const blocks=records.map((record,index)=>{
  const duration=record.at!==null&&record.end!==null&&record.end>=record.at?record.end-record.at:null;
  if(mode==='clock'){return {record,start:record.at===null?null:(record.at-start)/span,end:record.at===null?null:((record.end??record.at)-start)/span,duration};}
  if(mode==='duration')return {record,start:record.at===null?null:compressed(record.at)/compressedSpan,end:record.at===null?null:compressed(Math.max(record.at,record.end??record.at))/compressedSpan,duration};
  const left=cursor;cursor++;return {record,start:left,end:cursor,duration};
 });
 return {start,end,span:mode==='clock'?span:mode==='duration'?compressedSpan:cursor||1,blocks:mode!=='steps'?blocks:blocks.map(block=>({...block,start:block.start!/(cursor||1),end:block.end!/(cursor||1)}))};
}
export function formatDuration(value:number|null){return value===null?'—':value<1000?`${Math.round(value)} ms`:`${(value/1000).toFixed(value<10000?2:1)} s`;}
export function recordDuration(record:TrajectoryRecord){return record.at!==null&&record.end!==null&&record.end>=record.at?record.end-record.at:null;}
export function stringifyRecord(value:unknown){const result=value as {content?:{type:string;text?:string}[]}|null;if(result&&Array.isArray(result.content)&&result.content.length&&result.content.every(block=>block.type==='text')){const blocks=result.content.map(block=>{try{return JSON.parse(block.text||'')}catch{return block.text||''}});return blocks.length===1?stringify(blocks[0]):stringify(blocks);}return stringify(value);}
