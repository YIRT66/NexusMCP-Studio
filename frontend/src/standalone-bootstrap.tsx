import React,{useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {MotionConfig} from 'framer-motion';
import {App} from './DesktopApp';
import './styles.css';
import './plain.css';
import './desktop-shell.css';
import './workspace-features.css';
import {UIErrorBoundary} from './components/UIErrorBoundary';
function ReadyApp(){useEffect(()=>{window.nexusDesktop?.ready?.();},[]);return <App/>;}
createRoot(document.getElementById('root')!).render(<React.StrictMode><UIErrorBoundary><MotionConfig reducedMotion="user" transition={{type:'tween',duration:.2,ease:[.22,1,.36,1]}}><ReadyApp/></MotionConfig></UIErrorBoundary></React.StrictMode>);

