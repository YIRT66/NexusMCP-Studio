// 动态加载使模块初始化失败也能显示可恢复的提示，而不是留下空窗口。
import('./bootstrap').catch(error=>{
  console.error('界面初始化失败：',error);
  const root=document.getElementById('root');
  if(root){
    const screen=document.createElement('div');screen.className='startup-screen';
    const title=document.createElement('h1');title.textContent='界面未能加载';
    const detail=document.createElement('p');detail.textContent=error instanceof Error?error.message:String(error);
    const button=document.createElement('button');button.textContent='重新加载界面';button.onclick=()=>location.reload();
    screen.append(title,detail,button);root.replaceChildren(screen);
  }
  window.nexusDesktop?.ready?.();
});
