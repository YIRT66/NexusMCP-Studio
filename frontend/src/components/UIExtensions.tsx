import {useEffect} from 'react';
import {useStudio} from '../store';
import {useSessionUI} from '../session-ui';
import {request,send} from '../connection';
import {componentRenderers,notifyComponents} from '../studio-ui';
export function UIExtensions(){
  const extensions=useStudio(s=>s.extensions);const remote=useStudio(s=>s.remote);
  useEffect(()=>{
    let disposed=false;const cleanups:(()=>void)[]=[];
    for(const entry of extensions.filter(e=>e.enabled&&e.status==='installed'&&e.studio))void(async()=>{
      const base='/api/extensions/'+entry.id+'/assets/';
      const local:(()=>void)[]=[];
      try{
        if(entry.studio?.styles){const link=document.createElement('link');link.rel='stylesheet';link.href=base+entry.studio.styles;document.head.append(link);cleanups.push(()=>link.remove());}
        if(!entry.studio?.frontend)return;
        const module=await import(/* @vite-ignore */ base+entry.studio.frontend+'?v='+encodeURIComponent(entry.version||''));
        if(disposed)return;if(typeof module.activate!=='function')throw new Error('前端需导出 activate(api)');
        const cleanup=await module.activate({id:entry.id,store:useStudio,sessions:useSessionUI,request,send,document,
          registerComponent:(type:string,renderer:(value:Record<string,unknown>,container:HTMLElement)=>void|(()=>void))=>{if(!/^[\w-]{1,50}$/.test(type)||typeof renderer!=='function')throw new Error('组件定义无效');componentRenderers.set(type,renderer);notifyComponents();local.push(()=>{if(componentRenderers.get(type)===renderer)componentRenderers.delete(type);notifyComponents();});},
          mountOverlay:(node:HTMLElement)=>{document.body.append(node);local.push(()=>node.remove());return()=>node.remove();},
          on:(type:string,handler:EventListener)=>{window.addEventListener(type,handler);local.push(()=>window.removeEventListener(type,handler));},
          openPreview:(path:string)=>window.dispatchEvent(new CustomEvent('nexus:preview',{detail:{path}})),
        });
        const dispose=()=>{if(typeof cleanup==='function')cleanup();for(const fn of local.reverse())fn();};
        if(disposed)dispose();else cleanups.push(dispose);
      }catch(error){for(const cleanup of local.reverse())cleanup();if(!disposed)useStudio.getState().set({error:`扩展 ${entry.name}：${(error as Error).message}`});}
    })();
    return()=>{disposed=true;for(const cleanup of cleanups.reverse())cleanup();};
  },[extensions,remote]);
  return null;
}
