import {Component,type ReactNode} from 'react';
export class UIErrorBoundary extends Component<{children:ReactNode},{error:string}>{
 state={error:''};
 static getDerivedStateFromError(error:Error){return {error:error.stack||error.message};}
 componentDidCatch(error:Error){console.error('NexusMCP 界面渲染失败：',error);void fetch('/api/diagnostics/pause',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:'界面渲染',message:error.message,stack:error.stack})}).catch(()=>{});window.nexusDesktop?.ready?.();}
 render(){return this.state.error?<div className="startup-screen"><h1>界面异常，运行已暂停</h1><pre style={{whiteSpace:'pre-wrap',maxHeight:'60vh',overflow:'auto'}}>{this.state.error}</pre><button onClick={()=>location.reload()}>重新加载界面</button></div>:this.props.children;}
}
