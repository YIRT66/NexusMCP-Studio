import { randomUUID } from 'node:crypto';
import { origin, callContext } from './policy.mjs';
function preview(value, limit) {
  const json = JSON.stringify(value, (key, item) => /password|api.?key|token|authorization|secret/i.test(key) ? '[已隐藏]' : item?.type === 'image' ? { type: 'image', description: '截图结果' } : item);
  return json && json.length > limit ? json.slice(0, limit) + '\n…内容已截断' : json || '';
}
export function startActivity(tool, args) {
  if (origin() === 'preview') return () => {};
  const event = { id: randomUUID(), sessionId:callContext().sessionId, requestId:callContext().requestId, source: origin() === 'shared' ? '公网远控' : origin() === 'api' ? 'API 模型' : origin() === 'remote' ? 'GPT / MCP' : '本机操作', tool, phase: 'running', startedAt: new Date().toISOString(), input: preview(args, 10000) };
  process.send?.({ type: 'activity', event });
  return (result, error) => process.send?.({ type: 'activity', event: { ...event, phase: error || result?.isError ? 'error' : 'completed', endedAt: new Date().toISOString(), output: preview(error ? { error: error.message || String(error) } : result, 16000), durationMs: Date.now() - Date.parse(event.startedAt) } });
}
