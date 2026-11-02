/* Text tool transport for providers without native MCP. Never evaluate model code. */
(function(root){
  function parse(text, requestId, sessionId, blocks = []) {
    const candidates = [...blocks, ...Array.from(String(text).matchAll(/```nexus-tool\s*\n([\s\S]*?)```/g), match => match[1])];
    if (String(text).trim().startsWith('{')) candidates.push(String(text).trim());
    for (const source of candidates) {
      let value; try { value = JSON.parse(source); } catch { continue; }
      if (value?.protocol !== 'nexus-tool-v1' || value.requestId !== requestId || value.sessionId !== sessionId) continue;
      if (!Array.isArray(value.calls) || !value.calls.length || value.calls.length > 8) throw new Error('每轮工具调用必须为 1–8 条');
      const ids = new Set();
      for (const call of value.calls) {
        if (!call || typeof call.id !== 'string' || !/^[\w-]{1,80}$/.test(call.id) || ids.has(call.id) || typeof call.name !== 'string' || !/^[\w-]{1,120}$/.test(call.name) || !call.args || typeof call.args !== 'object' || Array.isArray(call.args)) throw new Error('工具调用格式无效或 ID 重复');
        ids.add(call.id);
      }
      if (JSON.stringify(value).length > 200000) throw new Error('工具参数超过限制');
      return value;
    }
    return null;
  }
  const api = { parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NexusToolProtocol = api;
})(globalThis);
