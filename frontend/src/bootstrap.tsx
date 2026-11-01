import React,{Component,useEffect,type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {MotionConfig} from 'framer-motion';
import {App} from './DesktopApp';
import './styles.css';
import './plain.css';
import './desktop-shell.css';
class UIErrorBoundary extends Component<{children:ReactNode},{error:string}> {
  state={error:''};
  static getDerivedStateFromError(error:Error){return {error:error.message};}
  componentDidCatch(error:Error){console.error('界面渲染失败：',error);window.nexusDesktop?.ready?.();}
  render(){return this.state.error?<div className="startup-screen"><h1>界面未能加载</h1><p>{this.state.error}</p><button onClick={()=>location.reload()}>重新加载界面</button></div>:this.props.children;}
}
function ReadyApp(){useEffect(()=>{window.nexusDesktop?.ready?.();},[]);return <App/>;}
createRoot(document.getElementById('root')!).render(<React.StrictMode><UIErrorBoundary><MotionConfig reducedMotion="user" transition={{type:'tween',duration:.2,ease:[.22,1,.36,1]}}><ReadyApp/></MotionConfig></UIErrorBoundary></React.StrictMode>);
