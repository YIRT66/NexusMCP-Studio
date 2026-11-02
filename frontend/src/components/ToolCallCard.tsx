import {useEffect,useState} from 'react';
import {AnimatePresence,motion,useReducedMotion} from 'framer-motion';
import {Check,ChevronDown,Copy,FilePenLine,LoaderCircle,Terminal,TriangleAlert} from 'lucide-react';
import {useStudio} from '../store';
import {FileChanges,type Change} from './FileChanges';
import {stringifyRecord} from '../trajectory';
import type {ToolCall} from '../types';
export function ToolCallCard({call}:{call:ToolCall}){
  const settings=useStudio(s=>s.settings);const[open,setOpen]=useState(settings.detail==='expanded');const[now,setNow]=useState(Date.now());const[copied,setCopied]=useState(false);const[copyError,setCopyError]=useState('');const reduced=useReducedMotion();
  useEffect(()=>{if(call.status!=='running'||!open)return;const timer=setInterval(()=>setNow(Date.now()),500);return()=>clearInterval(timer);},[call.status,open]);
  useEffect(()=>{if(settings.detail==='expanded')setOpen(true);else if(settings.autoCollapse&&call.status!=='running')setOpen(false);},[settings.detail,settings.autoCollapse,call.status]);
  useEffect(()=>{if(!copied)return;const timer=setTimeout(()=>setCopied(false),1600);return()=>clearTimeout(timer);},[copied]);
  let decoded:any=call.output;try{if(decoded?.content)decoded=JSON.parse(decoded.content.find((block:any)=>block.type==='text')?.text||'{}');else if(typeof decoded==='string')decoded=JSON.parse(decoded);}catch{}
  const changes:Change[]=typeof decoded?.addedLines==='number'?[decoded]:Array.isArray(decoded?.results)?decoded.results.filter((r:any)=>typeof r.result?.addedLines==='number').map((r:any)=>({...r.result,path:r.path})):[];
  const elapsed=Math.max(0,(call.endedAt||now)-call.startedAt);
  const data=(call.input&&typeof call.input==='object'?call.input:{}) as Record<string,unknown>;
  const file=String(data.file_path||data.path||'');const command=String(data.command||data.script||(/terminal_write/.test(call.name)?data.data:'')||'');const editing=/edit|write|patch|replace|create_file/i.test(call.name);const terminal=/terminal|shell|exec|command|pwsh/i.test(call.name);
  const label=editing?'修改文件':terminal?'运行命令':'调用工具';
  const preview=String(data.description||data.label||command.split('\n')[0]||file||call.name);
  async function copy(){try{const text=[command||JSON.stringify(call.input,null,2),call.output===undefined?'':stringifyRecord(call.output)].filter(Boolean).join('\n\n');if(window.nexusDesktop?.copyText){if(!await window.nexusDesktop.copyText(text))throw new Error('复制失败');}else await navigator.clipboard.writeText(text);setCopied(true);setCopyError('');}catch{setCopyError('复制失败，请选中文字复制。');}}
  return <article className={`execution-card ${call.status}`}>
    <button className="execution-summary" aria-expanded={open} onClick={()=>setOpen(!open)}><ChevronDown size={13} className={open?'expanded':''}/>{call.status==='running'?<LoaderCircle size={13} className="spin"/>:call.status==='error'?<TriangleAlert size={13}/>:editing?<FilePenLine size={13}/>:<Terminal size={13}/>}<span>{label}</span><span className="execution-preview" title={preview}>{preview}</span><code>{(elapsed/1000).toFixed(1)}s</code>{call.status==='completed'&&<Check size={12}/>}</button>
    {changes.map((change,index)=><FileChanges key={index} change={change}/>)}
    <AnimatePresence initial={false}>{open&&<motion.div className="execution-details" initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={{type:'tween',duration:reduced?0:.2,ease:[.22,1,.36,1]}}><div className="execution-code"><header><span><i className={call.status}/>{call.name}</span><button onClick={()=>void copy()}>{copied?<Check size={12}/>:<Copy size={12}/>} {copied?'已复制':'复制'}</button></header>{editing&&file&&<div className="execution-file"><FilePenLine size={13}/><span>{file}</span></div>}<pre aria-label="工具调用参数">{command||JSON.stringify(call.input,null,2)}</pre>{call.output!==undefined&&<div className="execution-output"><pre aria-label="工具执行结果">{stringifyRecord(call.output)}</pre></div>}{copyError&&<p className="settings-error">{copyError}</p>}</div></motion.div>}</AnimatePresence>
  </article>;
}
