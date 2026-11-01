/* 内置浏览器和 Chrome/Edge 扩展共用的 DOM 适配器。不读取 Cookie 或密码。 */
globalThis.nexusWebchatAdapter = async function (request = {}) {
  const selectors = {
    chatgpt: {input:['#prompt-textarea','textarea[data-id="root"]'],reply:['[data-message-author-role="assistant"]'],send:['[data-testid="send-button"]'],stop:['[data-testid="stop-button"]']},
    claude: {input:['.ProseMirror[contenteditable="true"]'],reply:['.font-claude-response','[data-is-streaming]'],send:['button[aria-label="Send message"]','button[aria-label="发送消息"]'],stop:['button[aria-label="Stop response"]']},
    deepseek: {input:['#chat-input','textarea'],reply:['.ds-markdown'],send:['button[aria-label="Send"]','[role="button"][aria-label="发送"]'],stop:['button[aria-label="Stop"]']},
    gemini: {input:['rich-textarea [contenteditable="true"]'],reply:['model-response .markdown','model-response'],send:['button.send-button','button[aria-label="Send message"]'],stop:['button[aria-label="Stop response"]','button[aria-label="停止回答"]']},
    qwen: {input:['textarea','[contenteditable="true"][role="textbox"]'],reply:['.qwen-markdown','[data-role="assistant"]'],send:[],stop:[]},
    kimi: {input:['[contenteditable="true"][role="textbox"]','[contenteditable="true"]','textarea'],reply:['.segment-assistant .markdown','.markdown-container'],send:[],stop:[]},
    doubao: {input:['textarea','[contenteditable="true"]'],reply:['[data-testid="message_text_content"]'],send:[],stop:[]},
  };
  const host=location.hostname;
  const provider=request.provider||(/chatgpt\.com$|chat\.openai\.com$/.test(host)?'chatgpt':/claude\.ai$/.test(host)?'claude':/deepseek\.com$/.test(host)?'deepseek':/gemini\.google\.com$/.test(host)?'gemini':/qwen\.ai$/.test(host)?'qwen':/kimi\.(?:com|ai)$/.test(host)?'kimi':/doubao\.com$/.test(host)?'doubao':'chatgpt');
  const config=selectors[provider]||selectors.chatgpt;
  const userSelectors={chatgpt:['[data-message-author-role="user"]'],claude:['[data-testid="user-message"]'],deepseek:['[data-role="user"]','.user-message'],gemini:['user-query'],qwen:['[data-role="user"]','.user-message'],kimi:['.segment-user'],doubao:['[data-testid="user_message"]','[data-role="user"]']};
  const visible=e=>e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
  const find=list=>{for(const selector of list){const e=[...document.querySelectorAll(selector)].find(visible);if(e)return e}return null};
  const labelled=pattern=>[...document.querySelectorAll('button,[role="button"]')].filter(visible).find(e=>pattern.test(`${e.getAttribute('aria-label')||''} ${e.getAttribute('title')||''} ${e.innerText||''}`.trim()));
  const editor=()=>find(config.input)||find(['textarea[placeholder]','[contenteditable="true"][role="textbox"]']);
  const sendButton=()=>find(config.send)||labelled(/^(?:send(?: message| prompt)?|发送(?:消息)?|提交)\s*$/i)||editor()?.closest('form')?.querySelector('button[type="submit"]');
  const stopButton=()=>find(config.stop)||labelled(/^(?:stop(?: generating| response)?|停止(?:生成|回答|回复)?)\s*$/i);
  const value=e=>e?(e instanceof HTMLTextAreaElement||e instanceof HTMLInputElement?e.value:e.innerText||e.textContent||''):'';
  const basicStatus=()=>{const input=editor();return {provider,url:location.href,title:document.title,ready:!!input,busy:!!stopButton(),input:value(input),replyMode:'mcp'}};
  if(request.operation==='status')return basicStatus();
  function snapshot(){
    let replies=[];
    for(const selector of config.reply){const nodes=[...document.querySelectorAll(selector)].filter(visible);if(nodes.length){replies=nodes;break}}
    const last=replies.at(-1);const input=editor();const button=sendButton();
    const users=[];for(const selector of userSelectors[provider]||[]){const found=[...document.querySelectorAll(selector)].filter(visible);if(found.length){users.push(...found);break}}
    const nodes=[...users.map(node=>({node,role:'user'})),...replies.map(node=>({node,role:'assistant'}))].sort((a,b)=>a.node===b.node?0:a.node.compareDocumentPosition(b.node)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1);
    const counts={user:0,assistant:0};let budget=200000;
    const messages=nodes.map(({node,role})=>({role,index:counts[role]++,content:node.innerText||node.textContent||''})).slice(-200).reverse().map(m=>{const limit=Math.min(budget,24000);budget-=Math.min(limit,m.content.length);return {...m,content:limit?m.content.slice(-limit):''}}).reverse().filter(m=>m.content);
    const problem=!input&&/Invalid content type|Route Error|Something went wrong|糟糕，出错了/.test(document.body?.innerText||'')?'网页返回错误，建议切换 Edge / Chrome 插件模式':'';
    return {provider,url:location.href,title:document.title,ready:!!input,input:value(input),reply:(last?.innerText||last?.textContent||'').slice(-200000),replyCount:replies.length,busy:!!stopButton(),canSend:!!button&&!button.disabled&&button.getAttribute('aria-disabled')!=='true',messages,problem,historyAvailable:users.length>0||provider==='chatgpt'&&replies.length>0};
  }
  if(request.operation==='inspect')return snapshot();
  if(request.operation==='stop'){const button=stopButton();if(!button)return {stopped:false,...snapshot()};button.click();return {stopped:true,...snapshot()}}
  if(request.operation!=='send')throw new Error('未知网页聊天操作');
  if(typeof request.text!=='string'||!request.text.trim()||request.text.length>100000)throw new Error('消息不能为空或超过 100000 字符');
  const before=basicStatus();if(before.busy)throw new Error('网页还在生成上一条回复，请先等待或停止');
  const input=editor();if(!input)throw new Error('未找到消息输入框，请打开网页完成登录或检查网站界面');
  input.focus();
  if(input instanceof HTMLTextAreaElement||input instanceof HTMLInputElement){const proto=input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(input,request.text);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
  else {const selection=getSelection(),range=document.createRange();range.selectNodeContents(input);selection.removeAllRanges();selection.addRange(range);if(!document.execCommand('insertText',false,request.text)){input.textContent=request.text;input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:request.text}))}}
  await new Promise(r=>setTimeout(r,200));
  if(value(input).trim()!==request.text.trim())throw new Error('网页输入框未接受消息，未点击发送');
  const button=sendButton();if(!button||button.disabled||button.getAttribute('aria-disabled')==='true')throw new Error('未找到可用的发送按钮，消息已填入网页但未发送，请检查网页');
  button.click();return {dispatched:true,before,after:basicStatus()};
};
