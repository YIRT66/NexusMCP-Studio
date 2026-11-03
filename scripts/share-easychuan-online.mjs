import assert from 'node:assert/strict';
import {promises as fs,createReadStream} from 'node:fs';
import {createHash,createPublicKey,publicEncrypt} from 'node:crypto';
import path from 'node:path';
import {chromium} from 'playwright-core';
const file=path.resolve(process.argv[2]),output=path.resolve('transfer'),minutes=60;
await fs.mkdir(output,{recursive:true});
const hash=async file=>{const digest=createHash('sha256');for await(const part of createReadStream(file))digest.update(part);return digest.digest('hex');};
const expected=await hash(file);let browser;
try{
 browser=await chromium.launch({headless:true});const context=await browser.newContext({locale:'zh-CN',acceptDownloads:true});const page=await context.newPage();page.setDefaultTimeout(60000);
 await page.goto('https://easychuan.cn/',{waitUntil:'domcontentloaded'});await page.locator('input[type=file]').first().waitFor({state:'attached'});await page.locator('input[type=file]').first().setInputFiles(file);
 const sent=page.waitForResponse(response=>new URL(response.url()).pathname==='/files/direct'&&response.request().method()==='POST');
 await page.getByRole('button',{name:/^发在线$|Send online/i}).first().click();const response=await sent;const result=await response.json();assert.ok(response.ok()&&result.fetch_code,JSON.stringify(result));
 const code=String(result.fetch_code);await page.locator('#fileFetchcodeArea').waitFor({state:'visible'});
 const url='https://easychuan.cn/r/'+encodeURIComponent(code)+'?t=nf';
 // Verify the real receiver path and received bytes before advertising a link.
 const receiver=await browser.newContext({locale:'zh-CN',acceptDownloads:true});const receive=await receiver.newPage();receive.setDefaultTimeout(90000);await receive.goto(url,{waitUntil:'domcontentloaded'});await receive.getByText(path.basename(file),{exact:false}).first().waitFor();
 const wakeNotice=receive.getByRole('button',{name:'好的',exact:true});if(await wakeNotice.isVisible())await wakeNotice.click();const [download]=await Promise.all([receive.waitForEvent('download',{timeout:180000}),receive.getByText(path.basename(file),{exact:false}).first().click()]);const received=path.join(output,'received-check.exe');await download.saveAs(received);assert.equal(await hash(received),expected,'易传接收文件校验失败');await fs.rm(received);await receiver.close();
 if(process.env.TRANSFER_SMOKE==='1'){console.log('在线直传接收与 SHA256 校验通过。');await browser.close();process.exit(0);}
 const expiresAt=new Date(Date.now()+minutes*60000).toISOString();const key=createPublicKey({key:Buffer.from(process.env.TRANSFER_PUBLIC_KEY,'base64'),format:'der',type:'spki'});await fs.writeFile(path.join(output,'online-link.enc'),publicEncrypt({key,oaepHash:'sha256'},Buffer.from(JSON.stringify({url,expiresAt,filename:path.basename(file),sha256:expected,bytes:(await fs.stat(file)).size}))));
 console.log('在线链接已创建，接收端下载与 SHA256 校验通过；发送端保持在线 60 分钟。');
 await new Promise(resolve=>setTimeout(resolve,minutes*60000));
}catch(error){console.error(error);if(browser){const page=browser.contexts()[0]?.pages()[0];if(page){await page.screenshot({path:path.join(output,'easychuan-error.png'),fullPage:true}).catch(()=>{});console.error((await page.locator('body').innerText().catch(()=>'' )).slice(0,3500));}}process.exitCode=1;}finally{await browser?.close();}
