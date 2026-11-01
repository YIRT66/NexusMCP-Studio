import {Bot} from 'lucide-react';
import {useState} from 'react';
import openai from '../assets/ai/openai.svg';
import claude from '../assets/ai/claude-color.svg';
import deepseek from '../assets/ai/deepseek-color.svg';
import gemini from '../assets/ai/gemini-color.svg';
import qwen from '../assets/ai/qwen-color.svg';
import kimi from '../assets/ai/kimi-color.svg';
import doubao from '../assets/ai/doubao-color.svg';
import '../chat-message.css';

const providers={
  chatgpt:{name:'ChatGPT',icon:openai},claude:{name:'Claude',icon:claude},
  deepseek:{name:'DeepSeek',icon:deepseek},gemini:{name:'Gemini',icon:gemini},
  qwen:{name:'Qwen',icon:qwen},kimi:{name:'Kimi',icon:kimi},doubao:{name:'豆包',icon:doubao},
};
const aliases:Record<string,keyof typeof providers>={openai:'chatgpt',anthropic:'claude',google:'gemini',alibaba:'qwen',moonshot:'kimi',bytedance:'doubao','豆包':'doubao','通义千问':'qwen'};
export function getAIIdentity(provider?:string){
  const key=(provider||'').toLowerCase().trim();
  const id=key in providers?key as keyof typeof providers:aliases[key];
  return id?{id,...providers[id]}:{id:'unknown',name:'AI',icon:undefined};
}
export function AIAvatar({provider,small=false,decorative=false}:{provider?:string;small?:boolean;decorative?:boolean}){
  const identity=getAIIdentity(provider);const[failedSource,setFailedSource]=useState<string>();
  return <span className={`ai-avatar ${small?'ai-avatar-small':''}`} data-provider={identity.id} role={decorative?undefined:'img'} aria-label={decorative?undefined:`${identity.name} 头像`} aria-hidden={decorative||undefined}>
    {identity.icon&&failedSource!==identity.icon?<img src={identity.icon} alt="" draggable={false} onError={()=>setFailedSource(identity.icon)}/>:<Bot size={small?13:17} strokeWidth={1.7}/>}
  </span>;
}
