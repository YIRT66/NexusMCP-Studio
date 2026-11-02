export function activate(api){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const intro=document.createElement('div');intro.className='delight-intro';
 const mark=document.createElement('img');mark.src='/icon.png';mark.alt='';intro.append(mark);api.mountOverlay(intro);
 const introTimer=setTimeout(()=>intro.remove(),reduced?0:650);
 const pet=document.createElement('button');pet.className='studio-work-pet';pet.setAttribute('aria-label','工作搭子：查看任务状态，拖动移动');
 const image=document.createElement('img');image.src='/icon.png';image.alt='';const bubble=document.createElement('span');bubble.textContent='工作空间已就绪';pet.append(image,bubble);api.mountOverlay(pet);
 let saved;try{saved=JSON.parse(localStorage.getItem('nexus.pet-position')||'null');}catch{}
 if(saved){pet.style.right='auto';pet.style.left=Math.min(innerWidth-60,Math.max(0,saved.x))+'px';pet.style.top=Math.min(innerHeight-60,Math.max(0,saved.y))+'px';pet.style.bottom='auto';}
 let drag=null,moved=false;
 pet.onpointerdown=event=>{drag={x:event.clientX,y:event.clientY,left:pet.offsetLeft,top:pet.offsetTop};moved=false;pet.setPointerCapture(event.pointerId);};
 pet.onpointermove=event=>{if(!drag)return;if(Math.abs(event.clientX-drag.x)+Math.abs(event.clientY-drag.y)>5)moved=true;if(!moved)return;pet.style.right='auto';pet.style.bottom='auto';pet.style.left=Math.min(innerWidth-60,Math.max(0,drag.left+event.clientX-drag.x))+'px';pet.style.top=Math.min(innerHeight-60,Math.max(0,drag.top+event.clientY-drag.y))+'px';};
 pet.onpointerup=()=>{if(drag&&moved)try{localStorage.setItem('nexus.pet-position',JSON.stringify({x:pet.offsetLeft,y:pet.offsetTop}));}catch{}drag=null;};
 pet.onclick=()=>{if(!moved)pet.classList.toggle('show-status');};
 const update=()=>{const state=api.store.getState();pet.dataset.busy=String(state.phase!=='idle');bubble.textContent=state.phase==='idle'?'工作空间已就绪':`正在处理 · ${state.calls.filter(call=>call.status==='running').length} 项操作`;};
 update();const unsubscribe=api.store.subscribe(update);
 api.registerComponent('workspace-note',(value,container)=>{const title=document.createElement('strong');title.textContent=String(value.title||'工作搭子');const text=document.createElement('p');text.textContent=String(value.text||'');container.append(title,text);});
 return()=>{clearTimeout(introTimer);unsubscribe();pet.remove();intro.remove();};
}
