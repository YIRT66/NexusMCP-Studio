import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronRight, Command, Folder, Grid2X2, Monitor, PanelLeft, Puzzle, Search, Settings, Shield, Square, TerminalSquare, Plus, MessageSquare, X, Plug, LoaderCircle } from 'lucide-react';
import { connect, request, act } from './connection';
import { useStudio } from './store';
import { ConversationWorkbench } from './components/ConversationWorkbench';
import {useSessionUI,chooseWorkspace} from './session-ui';
import { LiveDesktop } from './components/LiveDesktop';
import { CyberTerminal } from './components/CyberTerminal';
import { SystemExplorer } from './components/SystemExplorer';
import { SettingsDialog } from './components/SettingsDialog';
import { ExtensionManager } from './components/ExtensionManager';
import {McpServiceDialog} from './components/McpServiceDialog';
import {WorkspaceSidebar} from './components/WorkspaceSidebar';
import {ensureMcpStarted} from './mcp-service';
import {applyWebchatState} from './browser-link';
import type {WebchatState} from './types';

type Page = 'chat' | 'tools' | 'more' | 'desktop' | 'terminal' | 'explorer';
const titles: Record<Page, string> = { chat: '', tools: '插件', more: '更多', desktop: '电脑桌面', terminal: '终端', explorer: '文件与进程' };
const workViews = ['desktop', 'terminal', 'explorer'];
const ease = [0.22, 1, 0.36, 1] as const;
const inertWhen=(inactive:boolean)=>(element:HTMLElement|null)=>{if(element)element.inert=inactive;};

export function App() {
  const s = useStudio();
  const autoMcpStarted=useRef(false);
  useEffect(()=>{if(!s.connected||autoMcpStarted.current)return;autoMcpStarted.current=true;void ensureMcpStarted().catch(error=>{autoMcpStarted.current=false;s.set({error:'MCP 自动启动失败：'+error.message});});},[s.connected]);
  const ui=useSessionUI();
  useEffect(()=>{if(!s.connected)return;let active=true;void request<WebchatState>('/webchat/activate',{sessionId:ui.activeSessionId}).then(state=>{if(active)applyWebchatState(state);}).catch(error=>{if(active&&useStudio.getState().webchat.transport!=='extension')s.set({error:error.message});});return()=>{active=false;};},[ui.activeSessionId,s.connected,s.webchat.transport]);
  const [page, setPage] = useState<Page>('chat');
  const [sidebar, setSidebar] = useState(()=>!matchMedia('(max-width: 700px)').matches);
  useEffect(()=>{const media=matchMedia('(max-width: 700px)');const update=()=>setSidebar(!media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  const [query, setQuery] = useState('');
  const [nonce, setNonce] = useState(0);
  const [settingsTab,setSettingsTab]=useState<'general'|'model'|'mcp'|'permissions'>('general');
  const [mcpOpen,setMcpOpen]=useState(false);
  useEffect(()=>useStudio.subscribe((state,previous)=>{if(state.messages!==previous.messages||state.calls!==previous.calls)useSessionUI.getState().capture(state.messages,state.calls);}),[]);
  useEffect(()=>{const active=useSessionUI.getState().sessions.find(item=>item.id===ui.activeSessionId);if(active)s.set({messages:active.messages,calls:active.calls});},[ui.activeSessionId]);
  useEffect(()=>{const pending=window.nexusDesktop?.getWorkspacePath?.();if(!pending)return;void pending.then(path=>{if(!path)return;const state=useSessionUI.getState();if(!state.workspaces[0]?.path)useSessionUI.setState({workspaces:state.workspaces.map((item,index)=>index===0?{...item,path,name:path.split(/[\\/]/).filter(Boolean).at(-1)||item.name}:item)});}).catch(error=>console.error('无法读取工作区：',error));},[]);
  const [connection, setConnection] = useState(import.meta.env.VITE_WEB_PREVIEW === 'true' ? 0 : 1);
  const reduced = useReducedMotion();
  const transition = { type: 'tween' as const, duration: reduced ? 0 : 0.22, ease };
  useEffect(() => { if (connection) return connect(); s.set({connecting:false}); }, [connection]);
  useEffect(() => { const saved = localStorage.getItem('nexus.preferences'); if(saved) { try { const p=JSON.parse(saved); s.set({settings:{...useStudio.getState().settings,...p}}); } catch {} } }, []);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: light)');
    const update = () => {
      const theme = s.settings.theme === 'system' ? (media.matches ? 'light' : 'dark') : s.settings.theme;
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.setProperty('--activity-font', `${s.settings.fontSize}px`);
      window.nexusDesktop?.setTheme(theme);
    };
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [s.settings.theme, s.settings.fontSize]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (useStudio.getState().settingsOpen) useStudio.getState().set({ settingsOpen: false });
        else if (useStudio.getState().service.phase === 'running') act('agent.stop');
      }
      if ((event.ctrlKey || event.metaKey) && event.key === ',') {
        event.preventDefault(); useStudio.getState().set({ settingsOpen: true });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  const navigate = (next: Page) => { setPage(next); if(matchMedia('(max-width: 700px)').matches)setSidebar(false); };
  const openSettings = () => {setSettingsTab('general');s.set({ settingsOpen: true });};
  const openModel = () => {setSettingsTab('model');s.set({settingsOpen:true});};
  const openPlugins = () => {setSettingsTab('mcp');s.set({settingsOpen:true});};
  const moreActive = page !== 'chat' && page !== 'tools';

  return <div className="plain-app client-app desktop-shell">
    {import.meta.env.VITE_WEB_PREVIEW === 'true' && <div className="mobile-preview-banner" role="status">网页版预览 · 只展示界面，电脑控制及 MCP 功能不可用</div>}
    <header className="shell-titlebar">
      <button className="shell-sidebar-toggle" aria-label="切换侧边栏" title="切换侧边栏" aria-expanded={sidebar} onClick={() => setSidebar(!sidebar)}><PanelLeft size={16} /></button>
      <button className={'mcp-launch-trigger '+(s.service.phase==='running'?'running':'')} onClick={()=>setMcpOpen(true)} aria-label="启动 MCP 服务">{s.service.phase==='starting'?<LoaderCircle size={13} className="spin"/>:<Plug size={13}/>}<span>{s.service.phase==='running'?'MCP 服务已启动':s.service.phase==='starting'?'MCP 正在启动':'启动 MCP 服务'}</span></button>
    </header>
    <div className={`shell-layout ${sidebar ? '' : 'sidebar-collapsed'}`}>
      <div className="shell-sidebar-clip" ref={inertWhen(!sidebar||s.settingsOpen)}>
        <aside className="plain-sidebar shell-sidebar">
          <button className="shell-brand" aria-label="NexusMCP 首页" onClick={() => navigate('chat')}><Command size={24} strokeWidth={1.8} /><strong>NexusMCP</strong><span>STUDIO</span></button>
          <button className="new-chat" onClick={() => { if(s.phase!=='idle'){s.set({error:'请先停止当前任务。'});return;} ui.createSession();setNonce(n=>n+1);navigate('chat'); }}><Plus size={15} />新会话</button>
          <nav className="shell-primary-nav" aria-label="主导航">
            {([{ id: 'tools', icon: Puzzle, label: '插件', active: page === 'tools' }, { id: 'more', icon: Grid2X2, label: '更多', active: moreActive }] as const).map(({ id, icon: Icon, label, active }) =>
              <button key={id} aria-current={active ? 'page' : undefined} className={active ? 'active' : ''} onClick={() => navigate(id)}>
                {active && <motion.span className="shell-nav-indicator" layoutId="shell-nav-indicator" transition={transition} />}
                <Icon size={16} /><span>{label}</span>
              </button>)}
          </nav>
          <div className="session-heading"><span>工作区</span><button title="搜索工作会话" aria-label="搜索工作会话" onClick={() => document.getElementById('shell-session-search')?.focus()}><Search size={15} /></button><button title="设置" aria-label="打开设置" onClick={openSettings}><Settings size={15} /></button><button title="添加工作区" aria-label="添加工作区" onClick={()=>void chooseWorkspace().catch(error=>s.set({error:error.message}))}><Plus size={15}/></button></div>
          <input id="shell-session-search" aria-label="筛选工作会话" className="session-search" placeholder="搜索会话" value={query} onChange={event => setQuery(event.target.value)} />
          <div className="session-list"><WorkspaceSidebar query={query} isChat={page==='chat'} onSelect={()=>navigate('chat')}/></div>
          <footer><span className="local-avatar"><Monitor size={15} /></span><div><strong>本地工作空间</strong><small>{s.connected ? '本地运行时已连接' : '等待本地运行时'}</small></div><button title="设置" aria-label="打开设置" onClick={openSettings}><Settings size={16} /></button></footer>
        </aside>
      </div>
      {sidebar&&<button className="mobile-sidebar-scrim" aria-label="关闭侧边栏" onClick={()=>setSidebar(false)}/>}
      <main className={`plain-main shell-main page-${page}`} ref={inertWhen(s.settingsOpen)}>
        <header className="plain-topbar"><span>{titles[page]}</span><div><button className="runtime-button" title="连接本地运行时" onClick={()=>setConnection(n=>n+1)}><i className={s.connected ? 'online' : ''} />{s.connected ? '已连接' : s.connecting ? '正在连接' : '未连接'}</button>{s.service.phase === 'running' && <button className="plain-stop" onClick={() => void request('/service/stop', {}).catch(error => s.set({ error: error.message }))}><Square size={11} />停止</button>}</div></header>
        <div className="shell-page-surface" ref={inertWhen(workViews.includes(page)||page==='chat')}>
          <AnimatePresence initial={false} mode="wait">
            {!workViews.includes(page) && page!=='chat' && <motion.div key={page} className="shell-page-transition" initial={{ opacity: 0, y: reduced ? 0 : 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -3 }} transition={{ ...transition, duration: reduced ? 0 : 0.16 }}>
              {page === 'tools' && <ExtensionManager renderBuiltins={()=> <PluginsPage openSettings={openPlugins}/>}/>}
              
              {page === 'more' && <MorePage navigate={navigate} openSettings={openSettings} />}
            </motion.div>}
          </AnimatePresence>
        </div>
        <div className={`plain-view shell-chat-view ${page==='chat'?'current':''}`} ref={inertWhen(page!=='chat')}><ConversationWorkbench browserSuspended={page!=='chat'||mcpOpen} onOpenModel={openModel} onConnect={()=>setConnection(n=>n+1)}/></div>
        <div className={`plain-view work-view ${page === 'desktop' ? 'current' : ''}`} ref={inertWhen(page!=='desktop')}><LiveDesktop active={page === 'desktop'} /></div>
        <div className={`plain-view work-view ${page === 'terminal' ? 'current' : ''}`} ref={inertWhen(page!=='terminal')}><CyberTerminal /></div>
        <div className={`plain-view work-view ${page === 'explorer' ? 'current' : ''}`} ref={inertWhen(page!=='explorer')}><SystemExplorer /></div>
      </main>
    </div>
    <AnimatePresence>{s.settingsOpen && <SettingsDialog initialTab={settingsTab}/>}</AnimatePresence>
    <AnimatePresence>{mcpOpen&&<McpServiceDialog onClose={()=>setMcpOpen(false)} onConnect={()=>setConnection(n=>n+1)}/>}</AnimatePresence>
    <AnimatePresence>{s.error && <motion.div className="error-toast client-toast" role="alert" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} transition={transition}><span>{s.error}</span><button aria-label="关闭错误提示" onClick={() => s.set({ error: '' })}><X size={15} /></button></motion.div>}</AnimatePresence>
  </div>;
}

function MorePage({ navigate, openSettings }: { navigate: (page: Page) => void; openSettings: () => void }) {
  const entries = [
    { page: 'desktop', icon: Monitor, title: '电脑桌面', detail: '查看本机画面与操作位置' },
    { page: 'terminal', icon: TerminalSquare, title: '终端', detail: '打开终端，查看命令与输出' },
    { page: 'explorer', icon: Folder, title: '文件与进程', detail: '浏览文件与正在运行的进程' },
  ] as const;
  return <section className="shell-more-page">
    <h1>更多</h1><p>工作工具和应用设置，都在这里。</p>
    <div className="shell-more-section"><h2>工作工具</h2><div className="shell-more-list">{entries.map(({ page, icon: Icon, title, detail }) => <button key={page} onClick={() => navigate(page)}><span className="shell-more-icon"><Icon size={19} strokeWidth={1.6} /></span><span><strong>{title}</strong><small>{detail}</small></span><ChevronRight size={15} /></button>)}</div></div>
    <div className="shell-more-section"><h2>应用</h2><div className="shell-more-list"><button onClick={openSettings}><span className="shell-more-icon"><Settings size={19} strokeWidth={1.6} /></span><span><strong>设置</strong><small>外观、操作权限、MCP 服务与提示词</small></span><ChevronRight size={15} /></button><button onClick={() => navigate('chat')}><span className="shell-more-icon"><Shield size={19} strokeWidth={1.6} /></span><span><strong>返回会话</strong><small>回到当前任务与输入框</small></span><ChevronRight size={15} /></button></div></div>
  </section>;
}

function PluginsPage({openSettings}:{openSettings:()=>void}) {
  const s=useStudio();
  const [query,setQuery]=useState('');
  const filtered=s.tools.filter(tool=>`${tool.name} ${tool.description||''}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="shell-plugins-page"><div className="shell-section-heading"><h1>插件</h1><button className="shell-outline-button" onClick={openSettings}><Plus size={14}/>添加连接</button></div><p>管理你的工具与外部 MCP 连接。</p><label className="shell-search"><Search size={15}/><input aria-label="搜索插件" placeholder="搜索插件" value={query} onChange={event=>setQuery(event.target.value)}/></label>
    {!filtered.length&&<div className="shell-empty-state"><Puzzle size={26} strokeWidth={1.5}/><p>{query?'没有找到匹配的插件':s.connected?'暂无可用插件':'连接本地运行时后，在这里查看可用插件'}</p><button className="shell-outline-button" onClick={openSettings}>管理插件连接<ChevronRight size={13}/></button></div>}
    {[...new Set(filtered.map(tool=>tool.group))].map(group=><section className="plain-tool-group" key={group}><h2>{group}</h2>{filtered.filter(tool=>tool.group===group).map(tool=><div key={tool.name}><Puzzle size={16}/><span><strong>{tool.name}</strong><small>{tool.description||'MCP 工具'}</small></span><button role="switch" aria-label={`启用 ${tool.name}`} aria-checked={tool.enabled} disabled={!s.connected} onClick={()=>{const disabled=tool.enabled?[...s.settings.disabled,tool.name]:s.settings.disabled.filter(name=>name!==tool.name);void request('/settings',{disabled}).then(()=>s.set({settings:{...useStudio.getState().settings,disabled},tools:useStudio.getState().tools.map(item=>item.name===tool.name?{...item,enabled:!item.enabled}:item)})).catch(error=>s.set({error:error.message}));}}><i className={tool.enabled?'on':''}/></button></div>)}</section>)}
  </section>;
}
