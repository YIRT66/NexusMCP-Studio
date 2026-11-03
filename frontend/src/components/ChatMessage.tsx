import {ReasoningBlock} from './ReasoningActivity';
import {Copy,GitFork,RotateCcw} from 'lucide-react';
import {request} from '../connection';
import {useSessionUI} from '../session-ui';
import {RichReply} from './RichReply';
import {motion,useReducedMotion} from 'framer-motion';
import {useEffect,useRef,useState} from 'react';
import type {Message} from '../types';
import {AIAvatar,getAIIdentity} from './AIAvatar';

function useReplyText(content:string,streaming:boolean,reduced:boolean){
  const[displayed,setDisplayed]=useState(()=>streaming&&!reduced?'':content);
  const shown=useRef(displayed);const target=useRef(content);
  useEffect(()=>{
    target.current=content;
    if(reduced||!streaming||!content.startsWith(shown.current)){shown.current=content;setDisplayed(content);return;}
    let frame=0,last=0;
    const reveal=(now:number)=>{
      if(now-last>=24){last=now;const remaining=Array.from(target.current.slice(shown.current.length));const count=Math.max(1,Math.ceil(remaining.length/4));shown.current+=remaining.slice(0,count).join('');setDisplayed(shown.current);}
      if(shown.current.length<target.current.length)frame=requestAnimationFrame(reveal);
    };
    if(shown.current!==content)frame=requestAnimationFrame(reveal);
    return()=>cancelAnimationFrame(frame);
  },[content,streaming,reduced]);
  return reduced||!streaming?content:displayed;
}
export function ReplyTyping(){return <span className="reply-typing" role="status" aria-label="AI 正在回复"><span aria-hidden="true"><i/><i/><i/></span><small>正在回复</small></span>;}
export function ReplyPending({provider}:{provider?:string}){const reduced=useReducedMotion();const identity=getAIIdentity(provider);return <motion.article className="session-message chat-message-row assistant reply-pending" initial={{opacity:0,y:reduced?0:4}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={{type:'tween',duration:reduced?0:.16}}><header className="chat-message-author"><AIAvatar provider={provider}/><span>{identity.name}</span></header><ReplyTyping/></motion.article>;}
export function ChatMessage({message,streaming=false}:{message:Message;streaming?:boolean}){
  const reduced=useReducedMotion();const identity=getAIIdentity(message.provider);
  async function fork(){const ui=useSessionUI.getState();const branch=await request<any>('/sessions/'+encodeURIComponent(message.sessionId||ui.activeSessionId)+'/fork',{messageId:message.id});useSessionUI.setState({sessions:[branch,...ui.sessions],activeSessionId:branch.id,activeWorkspaceId:branch.workspaceId});}
  const content=useReplyText(message.content,streaming&&message.role==='assistant',!!reduced);
  return <motion.article className={`session-message chat-message-row ${message.role} ${streaming?'is-streaming':''}`} data-provider={message.role==='assistant'?identity.id:undefined} aria-label={message.role==='user'?'你的消息':`${identity.name} 的回复`} initial={{opacity:0,y:reduced?0:7,scale:reduced||message.role!=='user'?1:.985}} animate={{opacity:1,y:0,scale:1}} transition={{type:'tween',duration:reduced?0:.2,ease:[.22,1,.36,1]}}>
    {message.role==='assistant'&&<header className="chat-message-author"><AIAvatar provider={message.provider}/><span>{message.model||identity.name}</span>{message.source&&<small className="message-source">{message.source==='api'?'API':message.source==='browser'?'网页':'MCP'}</small>}</header>}
    <div className="chat-message-content">{message.role==='assistant'&&<ReasoningBlock message={message} streaming={streaming}/>}<div className={message.role==='user'?'chat-message-bubble':'chat-message-response'}>{!content&&streaming?<ReplyTyping/>:<div className="markdown"><RichReply content={content}/></div>}</div></div>
    {message.role==='assistant'&&!streaming&&<footer className="message-actions"><button aria-label="复制回复" onClick={()=>void (window.nexusDesktop?.copyText?window.nexusDesktop.copyText(message.content):navigator.clipboard.writeText(message.content))}><Copy size={13}/></button><button aria-label="从这里创建会话分支" onClick={()=>void fork()}><GitFork size={13}/></button><button aria-label="准备重试本轮" onClick={()=>{const ui=useSessionUI.getState(),session=ui.sessions.find(s=>s.id===ui.activeSessionId);const user=session?.messages.find(m=>m.role==='user'&&m.requestId===message.requestId);window.dispatchEvent(new CustomEvent('nexus:compose',{detail:{text:'请重新核实并完成本轮任务，沿用已确认的工具结果，不重复执行已完成的修改。\n\n'+(user?.content||message.content)}}));}}><RotateCcw size={13}/></button></footer>}
  </motion.article>;
}
