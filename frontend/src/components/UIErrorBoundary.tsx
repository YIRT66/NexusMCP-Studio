import {Component,type ReactNode} from 'react';
export class UIErrorBoundary extends Component<{children:ReactNode},{error:string}>{
 state={error:''};
 static getDerivedStateFromError(error:Error){return {error:error.message};}
 componentDidCatch(error:Error){console.error('NexusMCP 界面渲染失败：',error);window.nexusDesktop?.ready?.();}
 render(){return this.state.error?<div className="startup-screen"><h1>界面未能加载</h1><p>{this.state.error}</p><button onClick={()=>location.reload()}>重新加载界面</button></div>:this.props.children;}
}
