import {useEffect,useState} from 'react';
import {Brain,ChevronDown,LoaderCircle,CheckCircle2,MessageCircleQuestion} from 'lucide-react';
import {useStudio} from '../store';
import {useSessionUI} from '../session-ui';
import {UISelect} from './UISelect';
import type {Message} from '../types';
const labels:Record<string,string>={default:'默认',low:'低',medium:'中',high:'高',xhigh:'极高',max:'最高',enabled:'开启思考',disabled:'关闭思考'};
export function ReasoningActivity(){
 const s=useStudio(),ui=useSessionUI(),session=ui.sessions.find(item=>item.id===ui.activeSessionId)!;
 const profile=s.apiModels.find(model=>model.id===session.apiProfileId),api=session.modelMode==='api',state=s.apiChats[session.id];
 const waiting=s.questions.some(q=>q.sessionId===session.id&&q.status==='pending'),busy=api?state?.busy:s.webchat.busy;
 const last=s.messages.filter(m=>m.role==='assistant').at(-1);const[elapsed,setElapsed]=useState(0);
 useEffect(()=>{if(!busy)return;const start=(api?state?.startedAt:s.webchat.startedAt)||Date.now(),tick=()=>setElapsed(Math.floor((Date.now()-start)/1000));tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);},[busy,api?state?.requestId:s.webchat.requestId]);
 return <div className={'reasoning-activity '+(busy?'active':'')} aria-label="思考与执行状态">
  <div className="reasoning-level"><Brain size={13}/>{api&&profile?.reasoning?.efforts.length?<UISelect label="思考等级" value={session.reasoningEffort||'default'} options={profile.reasoning.efforts.map(value=>({value,label:labels[value]||value}))} placement="top" disabled={!!busy} onChange={value=>ui.updateSession({reasoningEffort:value})}/>:<span>{api?'模型未声明可调思考等级':`跟随网页${s.webchat.thinkingEnabled===true?' · 深度思考已开':s.webchat.thinkingEnabled===false?' · 深度思考未开':''}`}</span>}</div>
  <span role="status">{waiting?<MessageCircleQuestion size={12}/>:busy?<LoaderCircle size={12} className="spin"/>:<CheckCircle2 size={12}/>} {waiting?'等待你的回答':busy?(api?state?.status:s.webchat.status)||'正在处理':'就绪'}{busy&&!waiting&&<small>{elapsed} 秒</small>}</span>
 </div>;
}
export function ReasoningBlock({message,streaming}:{message:Message;streaming:boolean}){
 const[expanded,setExpanded]=useState(true),[manual,setManual]=useState(false);const working=message.reasoningStatus==='streaming'&&streaming;
 useEffect(()=>{if(!working&&!manual)setExpanded(false);},[working,manual]);
 if(!message.reasoning)return null;
 const seconds=message.reasoningStartedAt&&message.reasoningCompletedAt?Math.max(0,(message.reasoningCompletedAt-message.reasoningStartedAt)/1000):null;
 return <section className="reasoning-block" data-state={working?'running':'ok'}><button aria-expanded={expanded} onClick={()=>{setManual(true);setExpanded(!expanded);}}><Brain size={13}/>{working?'正在思考':'思考内容'}{seconds!==null&&<small>{seconds.toFixed(1)} 秒</small>}<ChevronDown size={13} className={expanded?'expanded':''}/></button>{expanded&&<div className="reasoning-text">{message.reasoning}</div>}</section>;
}
