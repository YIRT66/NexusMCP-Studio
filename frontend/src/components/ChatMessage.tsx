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
  const content=useReplyText(message.content,streaming&&message.role==='assistant',!!reduced);
  return <motion.article className={`session-message chat-message-row ${message.role} ${streaming?'is-streaming':''}`} data-provider={message.role==='assistant'?identity.id:undefined} aria-label={message.role==='user'?'你的消息':`${identity.name} 的回复`} initial={{opacity:0,y:reduced?0:7,scale:reduced||message.role!=='user'?1:.985}} animate={{opacity:1,y:0,scale:1}} transition={{type:'tween',duration:reduced?0:.2,ease:[.22,1,.36,1]}}>
    {message.role==='assistant'&&<header className="chat-message-author"><AIAvatar provider={message.provider}/><span>{message.model||identity.name}</span>{message.source&&<small className="message-source">{message.source==='api'?'API':message.source==='browser'?'网页':'MCP'}</small>}</header>}
    <div className="chat-message-content"><div className={message.role==='user'?'chat-message-bubble':'chat-message-response'}>{!content&&streaming?<ReplyTyping/>:<div className="markdown"><RichReply content={content}/></div>}</div></div>
  </motion.article>;
}
