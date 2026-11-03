export async function mountNativeShell(){
 const response=await fetch('/api/harness/start',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(90000)});
 if(!response.ok)throw new Error((await response.json()).error||'原生插件运行时启动失败');
 const status=await response.json();if(status.paused){await import('./standalone-bootstrap');return;}
 const html=await fetch('/api/harness/document').then(response=>{if(!response.ok)throw new Error('原生界面资源未就绪');return response.text();});
 document.getElementById('root')?.replaceChildren();
 const documentValue=new DOMParser().parseFromString(html,'text/html');
 for(const link of documentValue.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"],link[rel="modulepreload"]')){const copy=document.createElement('link');copy.rel=link.rel;copy.href='/native/'+link.getAttribute('href')!.replace(/^\.\//,'');document.head.append(copy);}
 const scripts=[...documentValue.querySelectorAll<HTMLScriptElement>('script')],modules:Promise<void>[]=[];
 if(!scripts.some(script=>script.type==='module'))throw new Error('原生界面入口缺失');
 for(const script of scripts){
  const copy=document.createElement('script');if(script.type)copy.type=script.type;
  const source=script.getAttribute('src');
  if(source){copy.src=source.startsWith('/')?source:'/native/'+source.replace(/^\.\//,'');const loaded=new Promise<void>((resolve,reject)=>{copy.onload=()=>resolve();copy.onerror=()=>reject(new Error('原生界面模块加载失败'));});document.head.append(copy);if(script.type==='module')modules.push(loaded);else await loaded;}
  else{copy.textContent=script.textContent;document.head.append(copy);}
 }
 await Promise.all(modules);
}
