import {useState} from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {Check,Copy} from 'lucide-react';

type Cell=string|number|boolean|null;
const scalar=(v:unknown):v is Cell=>v===null||['string','number','boolean'].includes(typeof v);
const list=(v:unknown):v is Cell[]=>Array.isArray(v)&&v.length<=200&&v.every(scalar);
function ComponentReply({source}:{source:string}){
  let value;try{if(source.length>100000)return null;value=JSON.parse(source);}catch{return null;}
  if(!value||typeof value!=='object'||typeof value.type!=='string')return null;
  const title=typeof value.title==='string'?value.title.slice(0,300):'';
  if(value.type==='table'&&list(value.columns)&&value.columns.length<=20&&Array.isArray(value.rows)&&value.rows.length<=200&&value.rows.every((row:unknown)=>list(row)&&row.length===value.columns.length))return <figure className="reply-component"><figcaption>{title}</figcaption><div className="reply-table-scroll" tabIndex={0}><table><thead><tr>{value.columns.map((column:Cell,i:number)=><th key={i}>{String(column??'')}</th>)}</tr></thead><tbody>{value.rows.map((row:Cell[],i:number)=><tr key={i}>{row.map((cell,j)=><td key={j}>{String(cell??'')}</td>)}</tr>)}</tbody></table></div></figure>;
  if(value.type==='card'&&typeof value.text==='string')return <aside className="reply-component reply-card"><strong>{title}</strong><p>{value.text.slice(0,20000)}</p></aside>;
  if(value.type==='metrics'&&Array.isArray(value.items)&&value.items.length<=12&&value.items.every((item:Record<string,unknown>)=>item&&typeof item.label==='string'&&scalar(item.value)))return <figure className="reply-component"><figcaption>{title}</figcaption><dl className="reply-metrics">{value.items.map((item:{label:string;value:Cell;unit?:string},i:number)=><div key={i}><dt>{item.label}</dt><dd>{String(item.value??'')}<small>{typeof item.unit==='string'?item.unit:''}</small></dd></div>)}</dl></figure>;
  if(value.type==='chart'&&Array.isArray(value.items)&&value.items.length>0&&value.items.length<=40&&value.items.every((item:Record<string,unknown>)=>item&&typeof item.label==='string'&&typeof item.value==='number'&&Number.isFinite(item.value)&&item.value>=0)){
    const max=Math.max(1,...value.items.map((item:{value:number})=>item.value));
    return <figure className="reply-component"><figcaption>{title}</figcaption><div className="reply-chart" role="img" aria-label={title||'数据图表'}>{value.items.map((item:{label:string;value:number},i:number)=><div key={i}><span>{item.label}</span><i style={{width:`${item.value/max*100}%`}}/><output>{item.value}</output></div>)}</div></figure>;
  }
  return null;
}
function CodeBlock({language,source}:{language:string;source:string}){
  const[copied,setCopied]=useState(false);
  if(language==='nexus-ui'){const component=ComponentReply({source});if(component)return component;}
  return <div className="reply-code"><header><span>{language||'文本'}</span><button aria-label="复制代码" onClick={()=>{const copy=window.nexusDesktop?.copyText?window.nexusDesktop.copyText(source):navigator.clipboard.writeText(source);void Promise.resolve(copy).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),1500);}).catch(()=>setCopied(false));}}>{copied?<Check size={13}/>:<Copy size={13}/>} {copied?'已复制':'复制'}</button></header><pre><code className={language?'language-'+language:undefined}>{source}</code></pre></div>;
}
export function RichReply({content}:{content:string}){
  return <Markdown remarkPlugins={[remarkGfm]} components={{pre({children}){return <>{children}</>;},code({className,children,node,...props}){const language=/language-(\S+)/.exec(className||'')?.[1]||'';const source=String(children).replace(/\n$/,'');return language||String(children).endsWith('\n')?<CodeBlock language={language} source={source}/>:<code className={className} {...props}>{children}</code>;},table({children}){return <div className="reply-table-scroll" tabIndex={0}><table>{children}</table></div>;}}}>{content}</Markdown>;
}
