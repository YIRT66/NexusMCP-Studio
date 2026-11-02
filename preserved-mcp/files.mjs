import { promises as fs } from 'node:fs';
import { createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import {fileChanges} from './changes.mjs';

const locks = new Map();
export const fileHash = text => createHash('sha256').update(text).digest('hex');
export async function lockedFile(file, action) {
  const absolute = path.resolve(file);
  const key = await fs.realpath(absolute).catch(error => { if (error.code !== 'ENOENT') throw error; return absolute; });
  const prior = locks.get(key) || Promise.resolve();
  const next = prior.catch(() => {}).then(() => action(key));
  locks.set(key, next);
  try { return await next; } finally { if (locks.get(key) === next) locks.delete(key); }
}
export async function readText(file, { startLine = 1, maxLines = 200, maxBytes = 65536 } = {}) {
  const input = createReadStream(file, { encoding: 'utf8' });
  let line = 1, bytes = 0, truncated = false, pending = '';
  const result = [];
  const accept = () => {
    if(line++ < startLine){pending='';return true;}
    const value=pending.replace(/\r$/,'');pending='';
    const size=Buffer.byteLength(value)+1;
    if(result.length>=maxLines||bytes+size>maxBytes){truncated=true;return false;}
    result.push(value);bytes+=size;return true;
  };
  try {
    outer: for await (const chunk of input) {
      let begin=0;
      while(begin<chunk.length){
        const end=chunk.indexOf('\n',begin),part=chunk.slice(begin,end<0?undefined:end);
        if(line>=startLine){
          if(bytes+Buffer.byteLength(pending)+Buffer.byteLength(part)+1>maxBytes){truncated=true;break outer;}
          pending+=part;
        }
        if(end<0)break;
        if(!accept())break outer;
        begin=end+1;
      }
    }
    if(!truncated&&pending)accept();
  } finally { input.destroy(); }
  return { path: path.resolve(file), text: result.join('\n'), startLine, endLine: startLine + result.length - 1, nextLine: truncated && result.length ? startLine + result.length : null, truncated, oversizedLine: truncated && !result.length };
}
export async function readWhole(file) {
  const handle = await fs.open(file, 'r');
  try {
    const stat=await handle.stat();if(!stat.isFile())throw new Error('目标必须是普通文件');
    if (stat.size > 2 * 1024 * 1024) throw new Error('文件超过 2 MB，请使用 startLine/maxLines 分段读取');
    return await handle.readFile('utf8');
  } finally { await handle.close(); }
}
async function atomicWrite(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const stat = await fs.stat(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (stat && !stat.isFile()) throw new Error('目标必须是普通文件');
  // Preserve hard links rather than replace their inode.
  if (stat?.nlink > 1) { await fs.writeFile(file, content, 'utf8'); return; }
  const temporary = path.join(path.dirname(file), `.nexus-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, content, { encoding: 'utf8', mode: stat ? stat.mode & 0o777 : 0o600, flag: 'wx' });
    if (stat) await fs.chmod(temporary, stat.mode & 0o777);
    if (stat && process.getuid?.() === 0) await fs.chown(temporary, stat.uid, stat.gid);
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, { force: true }); }
}
export function writeText(file, content, expectedHash) {
  return lockedFile(file, async target => {
    const before=await readWhole(target).catch(error=>{if(error.code==='ENOENT')return '';if(!expectedHash&&/2 MB/.test(error.message))return null;throw error;});
    if(expectedHash&&(before===null||fileHash(before)!==expectedHash))throw new Error('文件已变化，请重新读取后修改');
    const changes=before===null?{path:target,addedLines:content.split('\n').length,removedLines:0,approximate:true,lines:[],truncated:true}:fileChanges(before,content,target);
    if(before!==content)await atomicWrite(target, content);
    return { ok: true, bytes: Buffer.byteLength(content), hash: fileHash(content),...changes };
  });
}
export function patchText(file, edits, expectedHash) {
  return lockedFile(file, async target => {
    const before = await readWhole(target);
    if (expectedHash && fileHash(before) !== expectedHash) throw new Error('文件已变化，请重新读取后修改');
    let after = before;
    for (const { oldText, newText } of edits) {
      const first = after.indexOf(oldText);
      if (first < 0 || after.indexOf(oldText, first + 1) >= 0) throw new Error('原片段必须唯一匹配，请重新读取并扩大上下文；本次未写入');
      after = after.slice(0, first) + newText + after.slice(first + oldText.length);
    }
    if (Buffer.byteLength(after) > 4 * 1024 * 1024) throw new Error('修改后文件超过 4 MB');
    if(before!==after)await atomicWrite(target, after);
    return { ok: true, edits: edits.length, ...fileChanges(before,after,target), hash: fileHash(after) };
  });
}
export async function readMany(files, options) {
  const results = new Array(files.length);
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(4, files.length) }, async () => {
    while (index < files.length) {
      const at = index++;
      try { results[at] = await readText(files[at], options); } catch (error) { results[at] = { path: files[at], error: error.message }; }
    }
  }));
  return results;
}
