import React,{useEffect,useState} from 'react';
import {MotionConfig} from 'framer-motion';
import {UIErrorBoundary} from './components/UIErrorBoundary';
import {useStudio} from './store';
import {flushLocalSessions} from './session-ui';
import {App} from './DesktopApp';
import './styles.css';
import './plain.css';
import './desktop-shell.css';
import './workspace-features.css';
export const name='nexus-studio-shell';
export const inject=['slots','layout','theme','locale'];
export function apply(ctx:any){
 const root=ctx.slots.entries('root').find((entry:any)=>entry.registrant?.includes('ui-layout'))||ctx.slots.entries('root')[0];
 if(!root)throw new Error('Native DSH layout owner is unavailable');
 const original=root.component;
 const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href='/api/harness/style';document.head.append(sheet);
 function NexusFrame(props:any){
  const[panel,setPanel]=useState(''),[settingsMounted,setSettingsMounted]=useState(false);
  useEffect(()=>{let pending=false,loading=false;const attempt=()=>{const state=useStudio.getState();if(!pending||loading||state.webchat.busy||Object.values(state.apiChats).some(chat=>chat.busy))return;loading=true;void flushLocalSessions().then(()=>location.reload()).catch(error=>{loading=false;pending=false;state.set({error:error.message});});};const reload=()=>{pending=true;attempt();};window.addEventListener('nexus:harness-reload',reload);const unsubscribe=useStudio.subscribe(attempt);return()=>{unsubscribe();window.removeEventListener('nexus:harness-reload',reload);};},[]);
  useEffect(()=>{const open=(event:Event)=>{const requested=(event as CustomEvent).detail?.panel;if(requested==='settings'){setSettingsMounted(true);requestAnimationFrame(()=>requestAnimationFrame(()=>{const settings=ctx.slots.entries('sidebar.settings')[0];const actions=settings?.store?.create?.().actions;actions?.open?.();actions?.openSection?.((event as CustomEvent).detail?.section||'mascot');}));return;}const entries=ctx.slots.entries('main');const found=entries.find((entry:any)=>entry.options.key===requested)||entries.find((entry:any)=>String(entry.options.key).includes('settings'));if(found)setPanel(String(found.options.key));};window.addEventListener('nexus:native-panel',open);window.nexusDesktop?.ready?.();(window as any).__nexusHarness={ctx,version:'0.2.1-rc.5',rootOwner:root.registrant||original.name,mainPanels:ctx.slots.entries('main').map((entry:any)=>entry.options.key)};return()=>window.removeEventListener('nexus:native-panel',open);},[]);
  return <MotionConfig reducedMotion="user"><div className="nexus-native-root"><div style={panel?{display:'none'}:undefined}><UIErrorBoundary><App/></UIErrorBoundary></div>{panel&&<div className="native-plugin-panel"><header><button onClick={()=>setPanel('')}>返回 NexusMCP</button><strong>插件设置</strong></header>{props.renderSlot('main',{}, {entryKey:panel})}</div>}{settingsMounted&&<div style={{display:'none'}} aria-hidden="true">{props.renderSlot('sidebar',{collapsed:true,width:0})}</div>}{props.renderSlot('shell.overlay',{})}{ctx.slots.entries('shell.leading').some((entry:any)=>entry.registrant&&!String(entry.registrant).startsWith('@deepseek-ai/'))&&props.renderSlot('shell.leading',{})}{ctx.slots.entries('shell.bottom').some((entry:any)=>entry.registrant&&!String(entry.registrant).startsWith('@deepseek-ai/'))&&props.renderSlot('shell.bottom',{})}</div></MotionConfig>;
 }
 // Pinned rc.5 compatibility seam: retain the original owner's declarations,
 // stores, injected hooks and lifecycle; replace only its rendered frame.
 root.component=NexusFrame;
 const refresh=ctx.slots.register({name:'root',priority:10000},()=>null);refresh();
 return()=>{root.component=original;sheet.remove();};
}
