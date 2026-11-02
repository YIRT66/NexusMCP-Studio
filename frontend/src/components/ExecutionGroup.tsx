import {useState} from 'react';
import {AnimatePresence,motion,useReducedMotion} from 'framer-motion';
import {Check,ChevronRight,LoaderCircle,TriangleAlert} from 'lucide-react';
import {extractChanges} from './FileChanges';
import {ToolCallCard} from './ToolCallCard';
import {useStudio} from '../store';
import type {TrajectoryRecord} from '../trajectory';
import type {ToolCall} from '../types';
export function groupExecutions(records:TrajectoryRecord[]){
  const groups:{id:string;message?:TrajectoryRecord['message'];calls?:ToolCall[]}[]=[];
  for(const record of records){if(record.message)groups.push({id:record.id,message:record.message});else if(record.call){const last=groups.at(-1);if(last?.calls&&last.calls[0].requestId===record.call.requestId)last.calls.push(record.call);else groups.push({id:record.id,calls:[record.call]});}}
  return groups;
}
export function ExecutionGroup({calls}:{calls:ToolCall[]}){
  const detail=useStudio(s=>s.settings.detail);const[open,setOpen]=useState(detail==='expanded');const reduced=useReducedMotion();
  const changes=calls.flatMap(call=>extractChanges(call.output));const added=changes.reduce((n,c)=>n+c.addedLines,0),removed=changes.reduce((n,c)=>n+c.removedLines,0);
  const running=calls.some(call=>call.status==='running'),errors=calls.filter(call=>call.status==='error').length;
  return <section className={`execution-group ${running?'running':''}`}><button className="execution-group-toggle" aria-expanded={open} onClick={()=>setOpen(!open)}><ChevronRight size={14} className={open?'expanded':''}/>{running?<LoaderCircle size={14} className="spin"/>:errors?<TriangleAlert size={14}/>:<Check size={14}/>}<span>{running?'正在执行':'已执行'} {calls.length} 项操作</span>{changes.length>0&&<><strong className="diff-added">+{added}</strong><strong className="diff-removed">−{removed}</strong></>}{errors>0&&<small>{errors} 项失败</small>}<small>{open?'收起':'展开调用'}</small></button><AnimatePresence initial={false}>{open&&<motion.div className="execution-group-body" initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={{duration:reduced?0:.18}}>{calls.map(call=><ToolCallCard key={call.id} call={call}/>)}</motion.div>}</AnimatePresence></section>;
}
