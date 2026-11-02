import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
const context = new AsyncLocalStorage();
const pending = new Map();
export const policy = { mode: 'safe', disabled: [], prompt: '' };
export const origin = () => context.getStore()?.origin || 'remote';
export const callContext = () => context.getStore() || {};
export const inContext = (source, callback, metadata = {}) => context.run({ ...metadata, origin: source }, callback);
export function configure(next) { Object.assign(policy, next); }
export function resolveApproval(id, allowed) { const request = pending.get(id); if (!request) return false; clearTimeout(request.timer); pending.delete(id); process.send?.({ type: 'approval.resolved', id }); allowed ? request.resolve() : request.reject(new Error('用户拒绝了此操作')); return true; }
export function cancelApprovals(requestId,sharedAccessId) { for (const [id, request] of pending) if ((!requestId || request.requestId === requestId)&&(!sharedAccessId||request.sharedAccessId===sharedAccessId)) resolveApproval(id, false); }
export async function authorize(name, args, readOnly) {
  if (policy.disabled.includes(name)) throw new Error('此工具已在本机设置中禁用');
  if (name==='client_reply' || readOnly || !['remote','api','browser'].includes(origin()) || policy.mode === 'overdrive' || !process.send) return;
  if (pending.size >= 8) throw new Error('待审批操作过多，请等待用户处理');
  const id = randomUUID();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); process.send?.({ type: 'approval.resolved', id }); reject(new Error('操作审批已超时')); }, 90000);
    pending.set(id, { resolve, reject, timer, requestId: callContext().requestId, sharedAccessId:callContext().sharedAccessId });
    process.send({ type: 'approval', approval: { id, ...callContext(), title: name, description: `${origin() === 'api' ? 'API 模型' : origin() === 'browser' ? '浏览器模型' : 'GPT'} 请求执行 ${name}，请查看操作轨迹中的参数后决定是否允许。`, expiresAt: Date.now() + 90000 } });
  });
  if (policy.disabled.includes(name)) throw new Error('审批等待期间此工具已被禁用');
}
