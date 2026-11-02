import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readText,readMany,readWhole,writeText,patchText} from '../preserved-mcp/files.mjs';
test('文件：分段 UTF-8、大文件、批量读取、批量修改回滚与并发版本冲突',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nexus-files-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'中文.txt');await writeText(file,'第一行\r\n第二行\r\n第三行\n');
  const page=await readText(file,{startLine:2,maxLines:1});assert.equal(page.text,'第二行');assert.equal(page.nextLine,3);assert.equal(page.truncated,true);
  assert.equal((await readText(file,{startLine:3})).text,'第三行');
  const batch=await readMany([file,path.join(dir,'missing')]);assert.match(batch[0].text,/第二行/);assert.ok(batch[1].error);
  const snapshot=await writeText(file,'alpha beta');
  const attempts=await Promise.allSettled([patchText(file,[{oldText:'alpha',newText:'A'}],snapshot.hash),patchText(file,[{oldText:'beta',newText:'B'}],snapshot.hash)]);
  assert.equal(attempts.filter(v=>v.status==='fulfilled').length,1);assert.equal(await readWhole(file),'A beta');
  await assert.rejects(patchText(file,[{oldText:'A',newText:'changed'},{oldText:'absent',newText:'fail'}]),/未写入/);assert.equal(await readWhole(file),'A beta');
  await writeText(file,'unique');await fs.chmod(file,0o640);await patchText(file,[{oldText:'unique',newText:'kept'}]);if(process.platform!=='win32')assert.equal((await fs.stat(file)).mode&0o777,0o640);
  if(process.platform!=='win32'){const link=path.join(dir,'link');await fs.symlink(file,link);await patchText(link,[{oldText:'kept',newText:'symlink preserved'}]);assert.equal((await fs.lstat(link)).isSymbolicLink(),true);assert.equal(await readWhole(file),'symlink preserved');}
  const big=path.join(dir,'big');await fs.writeFile(big,'中文内容\n'.repeat(300000));await assert.rejects(readWhole(big),/2 MB/);assert.equal((await readText(big,{startLine:100000,maxLines:2})).text,'中文内容\n中文内容');
  await fs.writeFile(big,'x'.repeat(2000000)+'\nlast\n');assert.equal((await readText(big,{startLine:2})).text,'last');const oversized=await readText(big);assert.equal(oversized.oversizedLine,true);
});
