import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X, Settings2, Shield, Puzzle, KeyRound, Sun, Moon, Monitor, Plus, Trash2, Check } from 'lucide-react';
import { useStudio } from '../store';
import { request } from '../connection';
import type { Settings } from '../types';
import {ApiModelSettings} from './ApiModelSettings';
import {UISelect} from './UISelect';
import {PublicAccessSettings} from './PublicAccessSettings';

type Tab = 'general' | 'model' | 'mcp' | 'permissions' | 'public';
const tabs = [{ id: 'general', icon: Settings2, label: '通用设置' }, { id: 'model', icon: KeyRound, label: '模型' }, { id: 'mcp', icon: Puzzle, label: '插件连接' }, { id: 'permissions', icon: Shield, label: '操作权限' }] as const;
const ease = [0.22, 1, 0.36, 1] as const;
export function SettingsDialog({initialTab='general'}:{initialTab?:Tab}) {
  const s = useStudio();
  const [draft, setDraft] = useState(s.settings);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [saved, setSaved] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const tween = { type: 'tween' as const, duration: reduced ? 0 : 0.23, ease };
  const close = () => s.set({ settingsOpen: false });
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    root.current?.querySelector<HTMLButtonElement>('[aria-label="关闭设置"]')?.focus();
    return () => { if(previous?.isConnected) previous.focus(); };
  }, []);
  function preference<K extends 'theme' | 'fontSize' | 'detail' | 'autoCollapse'>(key: K, value: Settings[K]) {
    const next = { ...useStudio.getState().settings, [key]: value };
    setDraft(current => ({ ...current, [key]: value }));
    s.set({ settings: next });
    localStorage.setItem('nexus.preferences', JSON.stringify({ theme: next.theme, fontSize: next.fontSize, detail: next.detail, autoCollapse: next.autoCollapse }));
  }
  async function save() {
    setBusy(true); setError('');
    try {
      await request('/settings', draft);
      s.set({ settings: { ...useStudio.getState().settings, ...draft, apiKey: '' } });
      setDraft(current => ({ ...current, apiKey: '' }));
      setSaved(true);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function addServer() {
    setBusy(true); setError('');
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('请输入 HTTP 或 HTTPS 服务地址');
      const server = await request<(typeof s.servers)[number]>('/mcp/servers', { name: name.trim(), url: url.trim() });
      s.set({ servers: [...useStudio.getState().servers, server] }); setName(''); setUrl('');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <motion.div className="settings-modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween} onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <motion.div className="settings-dialog" role="dialog" aria-modal="true" aria-label="设置" ref={root} initial={{ opacity: 0, y: reduced ? 0 : 14, scale: reduced ? 1 : 0.975 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: reduced ? 0 : 8, scale: reduced ? 1 : 0.985 }} transition={tween} onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); close(); }
      if (event.key !== 'Tab') return;
      const elements = root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]');
      if (!elements?.length) return;
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}>
      <header className="settings-dialog-header"><h2>设置</h2><button className="settings-close" aria-label="关闭设置" onClick={close}><X size={18} /></button></header>
      <div className="settings-dialog-body">
        <nav className="settings-dialog-nav" aria-label="设置分类">{[...tabs,...(s.remote?[]:[{id:'public' as const,icon:Monitor,label:'公网远控'}])].map(({ id, icon: Icon, label }) => <button key={id} className={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => { setTab(id); setError(''); setSaved(false); }}>
          {tab === id && <motion.span className="settings-tab-indicator" layoutId="settings-tab-indicator" transition={tween} />}<Icon size={16} /><span>{label}</span>
        </button>)}</nav>
        <div className="settings-dialog-scroll"><AnimatePresence mode="wait" initial={false}><motion.div key={tab} className="settings-dialog-content" initial={{ opacity: 0, x: reduced ? 0 : 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduced ? 0 : -4 }} transition={{ ...tween, duration: reduced ? 0 : 0.13 }}>
          {tab === 'general' && <>
            <div className="settings-row"><div><strong>语言</strong><p>应用的显示语言</p></div><span className="settings-value">简体中文</span></div>
            <section className="settings-appearance"><h3>外观</h3><div>{([{ id: 'light', icon: Sun, label: '浅色' }, { id: 'dark', icon: Moon, label: '深色' }, { id: 'system', icon: Monitor, label: '跟随系统' }] as const).map(({ id, icon: Icon, label }) => <button key={id} className={draft.theme === id ? 'active' : ''} aria-pressed={draft.theme === id} onClick={() => preference('theme', id)}><Icon size={18} strokeWidth={1.6} /><span>{label}</span>{draft.theme === id && <Check size={12} className="appearance-check" />}</button>)}</div></section>
            <div className="settings-row"><div><strong>字号大小</strong><p>调整会话内容的字号</p></div><UISelect label="字号大小" value={String(draft.fontSize||14)} onChange={value=>preference('fontSize',Number(value))} options={[12,13,14,15,16,18].map(size=>({value:String(size),label:`${size} px`}))}/></div>
            <div className="settings-row"><div><strong>工作步骤显示</strong><p>工具参数与结果的默认显示方式</p></div><UISelect label="工作步骤显示" value={draft.detail||'standard'} onChange={value=>preference('detail',value as Settings['detail'])} options={[{value:'standard',label:'标准'},{value:'expanded',label:'展开详情'}]}/></div>
            <div className="settings-row"><div><strong>操作完成后收起详情</strong><p>需要时可再次展开查看</p></div><button className={'settings-switch ' + (draft.autoCollapse !== false ? 'on' : '')} role="switch" aria-label="操作完成后收起详情" aria-checked={draft.autoCollapse !== false} onClick={() => preference('autoCollapse', draft.autoCollapse === false)}><span /></button></div>
            <div className="settings-row"><div><strong>打开设置</strong><p>在任意页面快速打开</p></div><kbd>Ctrl + ,</kbd></div>
            <p className="settings-caption">外观设置即时生效，自动保存在本机。</p>
          </>}
          {tab === 'model' && <ApiModelSettings/>}
          {tab === 'public' && <PublicAccessSettings/>}
          {tab === 'mcp' && <><h3 className="settings-section-title">插件连接</h3><p className="settings-description">连接外部 MCP 服务，扩展可用工具。</p>
            {s.servers.map(server => <div className="settings-server" key={server.id}><Puzzle size={17} /><div><strong>{server.name}</strong><small>{server.url}</small></div><button aria-label={`移除 ${server.name}`} disabled={!s.connected || busy} onClick={() => void request('/mcp/servers/' + encodeURIComponent(server.id), undefined, 'DELETE').then(() => s.set({ servers: useStudio.getState().servers.filter(item => item.id !== server.id) })).catch(e => setError(e.message))}><Trash2 size={15} /></button></div>)}
            <label className="settings-field">服务名称<input value={name} placeholder="我的 MCP 服务" onChange={event => setName(event.target.value)} /></label><label className="settings-field">服务地址<input value={url} placeholder="https://example.com/mcp" onChange={event => setUrl(event.target.value)} /></label>
            <button className="shell-outline-button" disabled={!s.connected || busy || !name.trim() || !url.trim()} onClick={() => void addServer()}><Plus size={14} />{busy ? '正在连接…' : '添加连接'}</button>
          </>}
          {tab === 'permissions' && <><h3 className="settings-section-title">操作权限</h3><p className="settings-description">会话中的权限菜单支持仅可查看、工作区内修改与完全权限；实际权限由本地运行时确认。</p><div className="settings-row"><div><strong>默认审批方式</strong><p>在线任务由本地运行时执行权限检查</p></div><UISelect label="默认审批方式" value={draft.mode||s.mode} onChange={value=>setDraft({...draft,mode:value as Settings['mode']})} options={[{value:'safe',label:'逐次审批'},{value:'overdrive',label:'完全权限'}]}/></div><div className="settings-row"><div><strong>桌面预览帧率</strong><p>调整实时画面的更新频率</p></div><UISelect label="桌面预览帧率" value={String(draft.frameRate)} onChange={value=>setDraft({...draft,frameRate:Number(value)})} options={[1,2,5,10].map(value=>({value:String(value),label:`${value} FPS`}))}/></div></>}
          {tab !== 'general' && !s.connected && <p className="settings-offline">连接本地运行时后，可保存和启用这些配置。</p>}
          {error && <p className="settings-error" role="alert">{error}</p>}
        </motion.div></AnimatePresence></div>
      </div>
      <footer className="settings-dialog-footer"><span>{tab === 'general' ? '已自动保存' : saved ? '设置已保存' : '当前工作空间'}</span>{tab !== 'permissions' ? <button className="settings-done" onClick={close}>完成</button> : <button className="settings-done" disabled={busy || !s.connected} onClick={() => void save()}>{busy ? '正在保存…' : saved ? '已保存' : '保存设置'}</button>}</footer>
    </motion.div>
  </motion.div>;
}
