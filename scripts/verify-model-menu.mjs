import assert from 'node:assert/strict';

// Shared visual regression for the real web UI and the packaged Electron window.
export async function assertModelMenu(page,{screenshot}={}){
  const trigger=page.getByRole('button',{name:'选择模型',exact:true});
  await trigger.click();
  await page.getByRole('button',{name:'MCP 模型 使用已登录网页'}).click();
  await page.waitForFunction(()=>{
    const menu=document.querySelector('.model-picker-menu');
    return menu&&menu.getBoundingClientRect().height>100&&menu.querySelectorAll('.ai-avatar').length===7&&[...menu.querySelectorAll('.ai-avatar img')].every(img=>img.complete&&img.naturalWidth>0);
  });
  // Wait for the real expand/position animations, including Electron's default motion.
  await page.evaluate(()=>Promise.all(document.querySelector('.model-picker-menu').getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{}))));
  const layout=await page.locator('.model-picker-menu').evaluate(menu=>{
    const r=menu.getBoundingClientRect();
    return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,
      avatars:[...menu.querySelectorAll('.ai-avatar')].map(avatar=>{const r=avatar.getBoundingClientRect();return {width:r.width,height:r.height};}),
      labels:[...menu.querySelectorAll('.model-picker-option-label')].map(label=>({text:label.textContent,width:label.getBoundingClientRect().width})),
      petVisible:[...document.querySelectorAll('.studio-work-pet')].some(pet=>getComputedStyle(pet).visibility!=='hidden')};
  });
  assert.equal(layout.avatars.length,7);
  for(const avatar of layout.avatars){assert.ok(Math.abs(avatar.width-avatar.height)<.5,'模型头像必须保持圆形，不能被文字的 flex 样式拉宽');assert.ok(avatar.width>=16&&avatar.width<=24);}
  assert.deepEqual(layout.labels.map(item=>item.text),['ChatGPT','Claude','DeepSeek','Gemini','Qwen','Kimi','豆包']);
  assert.ok(layout.labels.every(item=>item.width>=50),'每个模型名称必须有独立的文字空间');
  assert.ok(layout.left>=0&&layout.right<=layout.width+1&&layout.top>=0&&layout.bottom<=layout.height+1,JSON.stringify(layout));
  assert.equal(layout.petVisible,false,'展开菜单时桌宠不得遮挡选项');
  const first=await page.evaluate(()=>document.activeElement?.outerHTML);
  await page.keyboard.press('ArrowDown');
  assert.notEqual(await page.evaluate(()=>document.activeElement?.outerHTML),first);
  if(screenshot)await page.screenshot({path:screenshot});
  await page.keyboard.press('Escape');
  await page.locator('.model-picker-menu').waitFor({state:'hidden'});
  assert.equal(await trigger.evaluate(button=>document.activeElement===button),true);
}
