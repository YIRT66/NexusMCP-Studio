/* Shared DOM adapter. Reads visible conversation content, never cookies or passwords. */
globalThis.nexusWebchatAdapter = async function (request = {}) {
  const selectors = {
    chatgpt: { input: ['#prompt-textarea', 'textarea[data-id="root"]', '[contenteditable="true"][data-lexical-editor]'], reply: ['[data-message-author-role="assistant"]'], user: ['[data-message-author-role="user"]'], send: ['[data-testid="send-button"]'], stop: ['[data-testid="stop-button"]'] },
    claude: { input: ['.ProseMirror[contenteditable="true"]', '[contenteditable="true"][role="textbox"]'], reply: ['[data-is-streaming]', '.font-claude-response', '[data-testid="assistant-message"]'], user: ['[data-testid="user-message"]'], send: ['button[aria-label="Send message"]', 'button[aria-label="发送消息"]'], stop: ['button[aria-label="Stop response"]'] },
    deepseek: { input: ['#chat-input', 'textarea[placeholder]', '[contenteditable="true"][role="textbox"]'], reply: ['[data-role="assistant"]', '.ds-markdown'], user: ['[data-role="user"]', '.user-message', '[data-message-author-role="user"]'], send: ['button[aria-label="Send"]', '[role="button"][aria-label="发送"]'], stop: ['button[aria-label="Stop"]', '[role="button"][aria-label="停止生成"]'] },
    gemini: { input: ['rich-textarea [contenteditable="true"]', '[contenteditable="true"][role="textbox"]'], reply: ['model-response .markdown', 'model-response', '[data-message-author-role="assistant"]'], user: ['user-query', '[data-message-author-role="user"]'], send: ['button.send-button', 'button[aria-label="Send message"]'], stop: ['button[aria-label="Stop response"]', 'button[aria-label="停止回答"]'] },
    qwen: { input: ['textarea', '[contenteditable="true"][role="textbox"]'], reply: ['[data-role="assistant"]', '.qwen-markdown'], user: ['[data-role="user"]', '.user-message'], send: [], stop: [] },
    kimi: { input: ['[contenteditable="true"][role="textbox"]', '[contenteditable="true"]', 'textarea'], reply: ['.segment-assistant .markdown', '.markdown-container', '[data-role="assistant"]'], user: ['.segment-user', '[data-role="user"]'], send: [], stop: [] },
    doubao: { input: ['textarea', '[contenteditable="true"]'], reply: ['[data-testid="message_text_content"]', '[data-role="assistant"]'], user: ['[data-testid="user_message"]', '[data-role="user"]'], send: [], stop: [] },
  };
  const host = location.hostname;
  const domain = value => host === value || host.endsWith('.' + value);
  const provider = request.provider || (domain('chatgpt.com') || domain('chat.openai.com') ? 'chatgpt' : domain('claude.ai') ? 'claude' : domain('deepseek.com') ? 'deepseek' : domain('gemini.google.com') ? 'gemini' : domain('qwen.ai') ? 'qwen' : domain('kimi.com') || domain('kimi.ai') ? 'kimi' : domain('doubao.com') ? 'doubao' : 'chatgpt');
  const config = selectors[provider] || selectors.chatgpt;
  const visible = element => !!element && !element.hidden && element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).display !== 'none';
  const all = list => {
    for (const selector of list) {
      const found = [...document.querySelectorAll(selector)].filter(visible);
      if (found.length) return found;
    }
    return [];
  };
  const find = list => all(list).at(-1) || null;
  const enabled = element => element && !element.disabled && element.getAttribute('aria-disabled') !== 'true';
  const labelled = pattern => [...document.querySelectorAll('button,[role="button"]')].filter(visible).find(element => pattern.test(`${element.getAttribute('aria-label') || ''} ${element.getAttribute('title') || ''} ${element.innerText || ''}`.trim()));
  const editor = () => find(config.input) || find(['main textarea', 'main [contenteditable="true"][role="textbox"]', 'form textarea', 'form [contenteditable="true"]']);
  const sendButton = () => find(config.send) || labelled(/^(?:send(?: message| prompt)?|发送(?:消息)?|提交)(?:\s*[（(].*?[)）])?\s*$/i) || [...(editor()?.closest('form')?.querySelectorAll('button[type="submit"]') || [])].find(visible);
  const stopButton = () => find(config.stop) || labelled(/^(?:stop(?: generating| response| generation)?|停止(?:生成|回答|回复)?|终止生成)(?:\s*[（(].*?[)）])?\s*$/i);
  const keyboardSend=['deepseek','qwen','kimi','doubao'].includes(provider);
  const value = element => element ? element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement ? element.value : element.innerText || element.textContent || '' : '';
  const identity = element => {
    if (!element) return '';
    const explicit = element.getAttribute('data-message-id') || element.id;
    if (explicit) return explicit;
    const registry = globalThis.__nexusMessageIds ||= { ids: new WeakMap(), next: 0 };
    if (!registry.ids.has(element)) registry.ids.set(element, 'message-' + ++registry.next);
    return registry.ids.get(element);
  };
  function snapshot(history = true) {
    const users = all([...config.user, '[data-message-author-role="user"]', '[data-role="user"]']);
    const replies = all([...config.reply, '[data-message-author-role="assistant"]', '[data-role="assistant"]']).filter(node=>!users.some(user=>user===node||user.contains(node)));
    const last = replies.at(-1), lastUser = users.at(-1), input = editor(), button = sendButton();
    // Never treat hidden controls or a streaming attribute explicitly set to false as active generation.
    const streaming = !!last && (last.getAttribute('data-is-streaming') === 'true' || last.getAttribute('aria-busy') === 'true' || !!last.querySelector('[data-is-streaming="true"],[aria-busy="true"]'));
    const userText = value(lastUser);
    const afterUser = last && lastUser ? !!(lastUser.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING) : false;
    const requestId = afterUser ? userText.match(/"requestId"\s*:\s*"([^"\n]+)"/)?.[1] : undefined;
    const reply = (globalThis.NexusReplyMarkdown?globalThis.NexusReplyMarkdown(last):value(last)).slice(-200000);
    const sent=globalThis.__nexusSentTurn;
    const fallbackRequest=sent && (identity(last)!==sent.replyId||replies.length>sent.replyCount||reply!==sent.reply) ? sent.requestId : undefined;
    const toolBlocks = last ? [...last.querySelectorAll('pre')].slice(-8).map(node=>(node.textContent||'').slice(0,200000)) : [];
    const problem = !input && /Invalid content type|Route Error|Something went wrong|糟糕，出错了/.test(document.body?.innerText || '') ? '网页返回错误，请刷新网页或重新绑定标签页' : '';
    const result = { adapterVersion: '1.2.0', provider, toolBlocks, url: location.href, title: document.title, ready: !!input, input: value(input), busy: !!stopButton() || streaming, streaming, canSend: !!enabled(button)||!button&&keyboardSend&&!!input, reply, replyId: identity(last), replyCount: replies.length, lastUserText: userText.slice(-120000), replyForRequestId: requestId || (!lastUser?fallbackRequest:undefined), problem, replyMode: 'mcp' };
    if (!history) return result;
    const nodes = [...users.map(node => ({ node, role: 'user' })), ...replies.map(node => ({ node, role: 'assistant' }))].sort((a, b) => a.node === b.node ? 0 : a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    const counts = { user: 0, assistant: 0 }; let budget = 200000;
    result.messages = nodes.slice(-200).map(({ node, role }) => { const text = value(node), limit = Math.min(budget, 24000); budget -= Math.min(limit, text.length); return { role, index: counts[role]++, content: limit?text.slice(-limit):'' }; }).filter(message => message.content);
    result.historyAvailable = users.length > 0;
    return result;
  }
  if (request.operation === 'inspect' || request.operation === 'status') return snapshot(request.operation === 'inspect');
  if (request.operation === 'stop') { const button = stopButton(); if (!button) return { stopped: false, ...snapshot() }; button.click(); return { stopped: true, ...snapshot() }; }
  if (request.operation !== 'send') throw new Error('未知网页聊天操作');
  if (typeof request.text !== 'string' || !request.text.trim() || request.text.length > 120000) throw new Error('消息不能为空或超过 120000 字符');
  const before = snapshot(false); if (before.busy) throw new Error('网页还在生成上一条回复，请先等待或停止');
  const input = editor(); if (!input) throw new Error('未找到聊天输入框，请完成登录、刷新网页或重新绑定当前标签页');
  input.focus();
  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, request.text);
    input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    const selection = getSelection(), range = document.createRange(); range.selectNodeContents(input); selection.removeAllRanges(); selection.addRange(range);
    if (!document.execCommand('insertText', false, request.text)) { input.textContent = request.text; input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: request.text })); }
  }
  await new Promise(resolve => setTimeout(resolve, 200));
  const normalize = text => text.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (normalize(value(input)) !== normalize(request.text)) throw new Error('网页输入框未接受消息，未点击发送');
  const button = sendButton();
  if (button&&!enabled(button) || !button&&!keyboardSend) throw new Error('未找到可用的发送按钮，消息已填入网页但未发送，请检查网页');
  globalThis.__nexusSentTurn={requestId:request.text.match(/"requestId"\s*:\s*"([^"\n]+)"/)?.[1],replyId:before.replyId,replyCount:before.replyCount,reply:before.reply};
  if(button)button.click();
  else {
    input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}));
    input.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));
    let accepted=false;
    for(let i=0;i<10;i++){await new Promise(resolve=>setTimeout(resolve,100));const after=snapshot(false);if(!value(input).trim()||after.busy||after.replyCount>before.replyCount){accepted=true;break;}}
    if(!accepted)throw new Error('网页没有确认 Enter 发送，请检查网页；不会自动重复提交');
  }
  return { dispatched: true, before, after: snapshot(false) };

};
