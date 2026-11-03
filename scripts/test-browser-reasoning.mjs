import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {fileURLToPath} from 'node:url';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();await page.setContent('<button aria-pressed="true">深度思考</button><textarea id="chat-input"></textarea><article data-role="user">question</article><article data-role="assistant"><section data-reasoning><div class="ds-think-content">public thought</div></section><div class="ds-markdown">final answer</div></article>');await page.addScriptTag({path:fileURLToPath(new URL('../browser-plugin/adapter.js',import.meta.url))});
 let result=await page.evaluate(()=>nexusWebchatAdapter({provider:'deepseek',operation:'status'}));assert.equal(result.reasoning,'public thought');assert.equal(result.reply,'final answer');assert.equal(result.thinkingEnabled,true);assert.equal(result.reasoningStatus,'completed');
 await page.evaluate(()=>{document.querySelector('button').removeAttribute('aria-pressed');const stop=document.createElement('button');stop.setAttribute('aria-label','Stop');document.body.append(stop);});result=await page.evaluate(()=>nexusWebchatAdapter({provider:'deepseek',operation:'status'}));assert.equal(result.thinkingEnabled,undefined,'没有真实开关状态时不能伪造思考等级');assert.equal(result.reasoningStatus,'streaming');assert.equal(result.reply.includes('public thought'),false);
 await page.setContent('<textarea id="chat-input"></textarea><article data-role="assistant"><section class="ds-think-content"><div class="ds-markdown">thought only</div></section></article>');result=await page.evaluate(()=>nexusWebchatAdapter({provider:'deepseek',operation:'status'}));assert.equal(result.reply,'','只有思考的回合不得冒充最终回答');assert.equal(result.reasoning,'thought only');
 console.log('网页公开思考：独立提取、嵌套去重、正文隔离、真实开关状态与生成状态：通过。');
}finally{await browser.close();}
