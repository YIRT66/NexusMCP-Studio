const element = id => document.getElementById(id);
const names = { chatgpt: 'ChatGPT', claude: 'Claude', deepseek: 'DeepSeek', gemini: 'Gemini', qwen: 'Qwen', kimi: 'Kimi', doubao: '豆包' };
const endpointPattern = /^ws:\/\/127\.0\.0\.1:\d+\/webchat\/extension\/[a-f0-9]{64}$/;
let tab, ready = false, pageBusy = false, sending = false, stopping = false, checking = false, submitting = false, initialized = false, lastState;
function notice(message = '') {
  element('notice-text').textContent = message;
  element('notice').hidden = !message;
}
function controls() {
  element('send').disabled = !ready || pageBusy || sending || !element('text').value.trim();
  element('stop').disabled = !pageBusy || sending || stopping;
  element('send').setAttribute('aria-label', sending ? '正在发送…' : '发送到当前网页');
  element('text').setAttribute('aria-busy', String(sending));
  element('stop').textContent = stopping ? '停止中…' : '停止';
}
function connectionStatus(status, text) {
  element('connection').dataset.status = status;
  element('connection').textContent = text;
}
async function clientStatus() {
  try {
    const state = await chrome.runtime.sendMessage({ type: 'nexus.status' });
    if (!state) throw new Error('无法读取客户端连接状态，请重新打开扩展。');
    lastState = state;
    if (!initialized) {
      if (state.endpoint) element('endpoint').value = state.endpoint;
      element('connection-settings').open = !state.connected;
      initialized = true;
    }
    const connecting = submitting || state.connecting;
    connectionStatus(state.connected ? 'connected' : connecting ? 'connecting' : 'disconnected', state.connected ? '已连接' : connecting ? '连接中' : '未连接');
    element('connection-description').textContent = state.connected ? '客户端已连接，网页回复将通过 MCP 回到软件。' : connecting ? '正在连接本机客户端，请稍候…' : state.endpoint ? '客户端暂未连接。请确认软件正在运行，扩展会自动重试。' : '粘贴客户端提供的地址，开始使用网页聊天。';
    element('disconnect').hidden = !state.endpoint;
    element('bind-active').hidden = !state.connected;
    element('provider').textContent = state.connected ? names[state.provider] || 'AI 网页' : '尚未绑定';
    element('session-title').textContent = state.connected && state.url ? '继续当前对话' : state.connected ? '为当前聊天打开网页' : '让对话接着发生';
    element('binding').textContent = !state.connected ? '连接客户端后，在软件中为当前聊天打开 AI 网页。' : state.url ? '当前会话已绑定网页。连续消息会复用同一个对话。' : '回到客户端，点击「为当前聊天打开网页」完成绑定。';
    element('open-binding').hidden = !state.connected || !state.url;
  } catch (error) {
    lastState = undefined;
    connectionStatus('disconnected', '未连接');
    element('connection-description').textContent = error.message;
    element('provider').textContent = '尚未绑定';
    element('session-title').textContent = '等待客户端连接';
    element('binding').textContent = '客户端连接恢复后，可继续原来的网页会话。';
    element('open-binding').hidden = true;
  }
}
async function command(data) {
  if (!tab?.id) throw new Error('请先打开支持的 AI 网页。');
  const result = await chrome.tabs.sendMessage(tab.id, { type: 'nexus.webchat', data });
  if (!result?.ok) throw new Error(result?.error || '网页尚未就绪，请刷新 AI 网页并完成登录。');
  return result.value;
}
async function refreshPage() {
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const value = await command({ operation: 'inspect' });
    ready = !!value.ready; pageBusy = !!value.busy;
    element('reply').textContent = value.reply || '';
    element('reply-section').hidden = !value.reply;
    element('state').textContent = pageBusy ? '当前网页正在生成回复' : ready ? '当前 AI 网页已就绪' : '请先在当前网页完成登录';
  } catch {
    ready = false; pageBusy = false;
    element('reply').textContent = '';
    element('reply-section').hidden = true;
    element('state').textContent = '请打开支持的 AI 网站，加载扩展后刷新网页。';
  }
  element('page-dot').dataset.ready = String(ready);
  controls();
}
async function refresh() {
  if (checking) return;
  checking = true;
  try { await Promise.all([clientStatus(), refreshPage()]); } finally { checking = false; }
}
element('connection-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (submitting) return;
  notice();
  const url = element('endpoint').value.trim();
  if (!endpointPattern.test(url)) {
    element('endpoint').setAttribute('aria-invalid', 'true');
    element('endpoint').focus();
    notice('请粘贴客户端「AI 浏览器」提供的完整扩展连接地址。');
    return;
  }
  submitting = true; element('connect').disabled = true; element('connect').textContent = '连接中…';
  try {
    const result = await chrome.runtime.sendMessage({ type: 'nexus.connect', url });
    if (!result || result.error) throw new Error(result?.error || '连接请求失败，请重试。');
    connectionStatus('connecting', '连接中');
  } catch (error) { notice(error.message); }
  finally { submitting = false; element('connect').disabled = false; element('connect').textContent = '连接'; await clientStatus(); }
});
element('endpoint').addEventListener('input', () => element('endpoint').removeAttribute('aria-invalid'));
element('disconnect').addEventListener('click', async () => {
  try {
    const result = await chrome.runtime.sendMessage({ type: 'nexus.disconnect' });
    if (!result || result.error) throw new Error(result?.error || '断开失败，请重试。');
    element('endpoint').value = ''; element('connection-settings').open = true; notice(); await clientStatus();
  } catch (error) { notice(error.message); }
});
element('open-binding').addEventListener('click', async () => {
  try {
    if (!lastState?.connected) throw new Error('请先连接客户端。');
    const result = await chrome.runtime.sendMessage({ type: 'nexus.focus-bound' });
    if (!result || result.error) throw new Error(result?.error || '无法打开会话网页。');
  } catch (error) { notice(error.message); }
});
element('text').addEventListener('input', controls);
element('text').addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.isComposing) { event.preventDefault(); element('send').click(); }
});
element('send').addEventListener('click', async () => {
  if (element('send').disabled) return;
  sending = true; controls(); notice();
  const draft = element('text').value;
  try {
    await command({ operation: 'send', text: draft.trim() });
    if (element('text').value === draft) element('text').value = '';
    await refreshPage();
  } catch (error) { notice(error.message); }
  finally { sending = false; controls(); }
});
element('stop').addEventListener('click', async () => {
  if (element('stop').disabled) return;
  stopping = true; controls(); notice();
  try {
    const result = await command({ operation: 'stop' });
    if (result?.busy && !result?.stopped) throw new Error('网页未停止，请在网页中手动停止。');
    await refreshPage();
  } catch (error) { notice(error.message); }
  finally { stopping = false; controls(); }
});
element('copy-reply').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(element('reply').textContent); element('copy-reply').textContent = '已复制'; }
  catch { notice('复制失败，请选中回复文本手动复制。'); }
});
element('dismiss-notice').addEventListener('click', () => notice());
void refresh();
const timer = setInterval(refresh, 1500);
window.addEventListener('pagehide', () => clearInterval(timer), { once: true });

element('bind-active').addEventListener('click',async()=>{try{const result=await chrome.runtime.sendMessage({type:'nexus.bind-active'});if(!result||result.error)throw new Error(result?.error||'绑定失败');notice();await refresh();}catch(error){notice(error.message);}});
element('debug-enable').addEventListener('click',async()=>{try{const result=await chrome.runtime.sendMessage({type:'nexus.debug-enable'});if(result?.error)throw new Error(result.error);notice('当前绑定网页已开启调试。浏览器提示条关闭后，调试会断开。');}catch(error){notice(error.message);}});
element('debug-disable').addEventListener('click',async()=>{try{const result=await chrome.runtime.sendMessage({type:'nexus.debug-disable'});if(result?.error)throw new Error(result.error);notice('网页调试已关闭');}catch(error){notice(error.message);}});
