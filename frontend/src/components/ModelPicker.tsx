import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {AnimatePresence,motion,useReducedMotion} from 'framer-motion';
import {Check,ChevronDown,Globe,KeyRound,Plus} from 'lucide-react';
import {AIAvatar} from './AIAvatar';
import {aiSites} from './AIBrowserPanel';
import type {ApiModelProfile} from '../types';
import '../model-picker.css';
export function ModelPicker({mode,provider,profileId,profiles,disabled,onSelect,onManage,openSignal}:{mode:'mcp'|'api';provider:string;profileId:string;profiles:ApiModelProfile[];disabled?:boolean;onSelect:(mode:'mcp'|'api',id:string)=>void;onManage:()=>void;openSignal:number}){
 const[open,setOpen]=useState(false);const[group,setGroup]=useState<'mcp'|'api'>(mode);const[position,setPosition]=useState({left:10,top:10,width:300,maxHeight:480});const trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null),previousSignal=useRef(openSignal);const reduced=useReducedMotion();
 const profile=profiles.find(item=>item.id===profileId),site=aiSites.find(item=>item.id===provider);const label=mode==='api'?profile?.name||'选择 API 模型':site?.name||'选择 MCP 模型';
 useEffect(()=>{if(previousSignal.current!==openSignal&&!disabled){previousSignal.current=openSignal;setOpen(true);}},[openSignal,disabled]);
 useEffect(()=>{if(!open)return;const id=requestAnimationFrame(()=>menu.current?.querySelector<HTMLButtonElement>('button')?.focus());return()=>cancelAnimationFrame(id);},[open]);
 useLayoutEffect(()=>{
  if(!open)return;
  const place=()=>{
   const rect=trigger.current?.getBoundingClientRect();if(!rect)return;
   const viewport=window.visualViewport,left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0;
   const width=Math.min(300,(viewport?.width||innerWidth)-20),bottom=top+(viewport?.height||innerHeight);
   const above=Math.max(0,rect.top-top-19),below=Math.max(0,bottom-rect.bottom-19);
   const upwards=above>=Math.min(menu.current?.scrollHeight||300,200)||above>=below;
   const maxHeight=Math.max(1,Math.min(480,upwards?above:below,bottom-top-20));
   const height=Math.min(menu.current?.offsetHeight||300,maxHeight);
   const next={width,maxHeight,left:Math.max(left+10,Math.min(left+(viewport?.width||innerWidth)-width-10,rect.right-width)),top:Math.max(top+10,Math.min(bottom-height-10,upwards?rect.top-height-9:rect.bottom+9))};
   setPosition(previous=>Object.keys(next).every(key=>previous[key as keyof typeof next]===next[key as keyof typeof next])?previous:next);
  };
  place();const observer=new ResizeObserver(place);if(menu.current)observer.observe(menu.current);if(trigger.current)observer.observe(trigger.current);
  window.addEventListener('resize',place);window.visualViewport?.addEventListener('resize',place);window.visualViewport?.addEventListener('scroll',place);
  return()=>{observer.disconnect();window.removeEventListener('resize',place);window.visualViewport?.removeEventListener('resize',place);window.visualViewport?.removeEventListener('scroll',place);};
 },[open,group,profiles.length]);
 useEffect(()=>{if(!open)return;const outside=(event:PointerEvent)=>{if(!menu.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))setOpen(false);};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[open]);
 function select(mode:'mcp'|'api',id:string){onSelect(mode,id);setOpen(false);trigger.current?.focus();}
 return <><button ref={trigger} className="model-picker-trigger" aria-label="选择模型" aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={()=>{setGroup(mode);setOpen(value=>!value);}}>{mode==='mcp'?<AIAvatar provider={provider} small decorative/>:<KeyRound size={14}/>}<span className="model-picker-trigger-label">{label}</span><small>{mode.toUpperCase()}</small><ChevronDown size={12}/></button>
 {createPortal(<AnimatePresence>{open&&<motion.div ref={menu} className="model-picker-menu" role="menu" aria-label="选择模型" style={position} initial={{opacity:0,y:reduced?0:5,scale:reduced?1:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:reduced?0:4}} transition={{duration:reduced?0:.16}} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();setOpen(false);trigger.current?.focus();}if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const buttons=[...menu.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];const index=buttons.indexOf(document.activeElement as HTMLButtonElement),next=(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();}}}>
 <p className="model-picker-caption">选择本次会话的模型</p>
 {(['mcp','api'] as const).map(value=><div className="model-picker-group" key={value}><button className="model-picker-group-heading" aria-expanded={group===value} onClick={()=>setGroup(value)}>{value==='mcp'?<Globe size={15}/>:<KeyRound size={15}/>}<strong>{value==='mcp'?'MCP 模型':'API 模型'}</strong><small>{value==='mcp'?'使用已登录网页':'通过接口连接'}</small><ChevronDown size={13} className={group===value?'is-open':''}/></button><AnimatePresence initial={false}>{group===value&&<motion.div className="model-picker-options" initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={{duration:reduced?0:.18}}>{value==='mcp'?aiSites.map(site=><button role="menuitemradio" aria-checked={mode==='mcp'&&provider===site.id} key={site.id} onClick={()=>select('mcp',site.id)}><AIAvatar provider={site.id} small decorative/><span className="model-picker-option-label">{site.name}</span>{mode==='mcp'&&provider===site.id&&<Check size={14}/>}</button>):<>{profiles.length?profiles.map(profile=><button role="menuitemradio" aria-checked={mode==='api'&&profileId===profile.id} key={profile.id} onClick={()=>select('api',profile.id)}><KeyRound size={14}/><span className="model-picker-option-label">{profile.name}<small>{profile.model}</small></span>{mode==='api'&&profileId===profile.id&&<Check size={14}/>}</button>):<p className="model-picker-empty">添加 API 地址和模型后，即可直接在这里聊天。</p>}<button className="model-picker-add" onClick={()=>{setOpen(false);onManage();}}><Plus size={14}/>管理 API 模型</button></>}</motion.div>}</AnimatePresence></div>)}
 </motion.div>}</AnimatePresence>,document.body)}</>;
}
