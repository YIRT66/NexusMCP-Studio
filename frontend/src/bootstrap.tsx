import {mountNativeShell} from './native-bootstrap';
if(import.meta.env.VITE_WEB_PREVIEW==='true')void import('./standalone-bootstrap');
else void mountNativeShell().catch(error=>{const root=document.getElementById('root')!;root.textContent='原生运行时未就绪：'+error.message;const button=document.createElement('button');button.textContent='重试启动';button.onclick=()=>location.reload();root.append(button);window.nexusDesktop?.ready?.();});
