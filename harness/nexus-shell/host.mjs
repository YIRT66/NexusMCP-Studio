import {Session, appendPluginRecord, pluginRecordOf} from '@deepseek-ai/dsh-session';
import {createHash, randomUUID} from 'node:crypto';
import {deltaFor, applyDelta, foldRecords} from './session-records.mjs';
export const name = 'nexus-studio-shell';
const idFor = id => 'nexus_' + createHash('sha256').update(id).digest('hex').slice(0, 32);
async function bodyOf(req, limit) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > limit) throw new Error('请求内容超过限制'); }
  return JSON.parse(raw);
}
function json(res, value, status = 200) { res.writeHead(status, {'content-type': 'application/json'}); res.end(JSON.stringify(value)); }
export function apply(ctx) {
  ctx.inject(['webServer', 'sessionPersistence', 'sessions', 'tools'], host => {
    const live = new Map();
    let queue = Promise.resolve();
    const serialize = action => { const result = queue.catch(() => {}).then(action); queue = result; return result; };
    async function close(entry) {
      await host.sessions.flush(entry.session);
      await entry.handle.close();
      entry.detach();
    }
    async function open(id, snapshot) {
      const nativeId = idFor(id);
      if (live.has(nativeId)) { const entry = live.get(nativeId); live.delete(nativeId); live.set(nativeId, entry); return entry; }
      const stored = await host.sessionPersistence.stat(nativeId);
      if (!stored && !snapshot) return null;
      if (live.size >= 8) { const [key, entry] = live.entries().next().value; await close(entry); live.delete(key); }
      const header = {...Session.create(nativeId).header, ...((snapshot?.workspacePath||snapshot?.patch?.metadata?.workspacePath) ? {cwd:snapshot.workspacePath||snapshot.patch.metadata.workspacePath} : {})};
      const handle = stored ? await host.sessionPersistence.open(nativeId, 'write') : await host.sessionPersistence.create(header);
      let detach;
      try {
        const {events, eventState} = await handle.read();
        const session = host.sessions.prepare(nativeId, stored ? {seed:events, meta:handle.header, inheritedEventCount:handle.inheritedEventCount, eventState} : {meta:handle.header});
        // rc.5 prepares an end-of-seed marker even when restoring. This cold
        // prefix predates live routing and must reach the writer first.
        if(session.seq>events.length)await handle.append(session.snapshotEvents(events.length));
        detach = host.sessions.enter(session);
        host.sessions.announce(session);
        const entry = {handle, session, detach, snapshot:foldRecords(events.map(pluginRecordOf))};
        live.set(nativeId, entry);
        return entry;
      } catch (error) { detach?.(); await handle.close(); throw error; }
    }
    const disposeSnapshot = host.webServer.register({kind:'exact', path:'/api/nexus-session', handler:async(req,res) => {
      try {
        if (!['GET', 'POST'].includes(req.method)) return json(res, {error:'不支持的请求方法'}, 405);
        const value = req.method === 'POST' ? await bodyOf(req, 16 * 1024 * 1024) : undefined;
        const id = value?.id || new URL(req.url, 'http://localhost').searchParams.get('id');
        if (typeof id !== 'string' || !id || id.length > 150) throw new Error('无效的会话标识');
        await serialize(async() => {
          const entry = await open(id, value);
          if (!entry) return json(res, null, 404);
          if (value) {
            const patch = deltaFor(entry.snapshot, value.patch ? applyDelta(entry.snapshot,value.patch) : value);
            if (patch) { appendPluginRecord(entry.session, 'plugin:nexus.delta', patch); entry.snapshot = applyDelta(entry.snapshot, patch); }
            await host.sessions.flush(entry.session);
            return json(res, {persisted:true, seq:entry.session.seq});
          }
          json(res, entry.snapshot);
        });
      } catch (error) { if (!res.headersSent) json(res, {error:error.message}, 400); }
    }});
    const disposeTools = host.webServer.register({kind:'exact', path:'/api/nexus-tools', handler:async(req,res) => {
      try {
        if (req.method === 'GET') return json(res, host.tools.schemas());
        if (req.method !== 'POST') return json(res, {error:'不支持的请求方法'}, 405);
        const body = await bodyOf(req, 200000);
        json(res, await host.tools.execute({callId:randomUUID(), name:body.name, arguments:body.args || {}, signal:AbortSignal.timeout(120000)}));
      } catch (error) { json(res, {error:error.message}, 400); }
    }});
    return async() => { disposeSnapshot(); disposeTools(); await queue.catch(() => {}); await Promise.allSettled([...live.values()].map(close)); live.clear(); };
  });
}
