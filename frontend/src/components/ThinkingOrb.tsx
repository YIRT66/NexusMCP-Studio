import {motion,useReducedMotion} from 'framer-motion';
export function ThinkingOrb({active=false,small=false}:{active?:boolean;small?:boolean}){
 const reduce=useReducedMotion();
 return <div className={`orb ${small?'orb-small':''} ${active?'orb-active':''}`} aria-label={active?'AI 正在执行任务':'AI 待命'}><motion.div className="orb-halo" animate={!reduce&&active?{scale:[.9,1.2,.9],opacity:[.35,.75,.35]}:{scale:1,opacity:.25}} transition={{duration:2.4,repeat:active?Infinity:0,ease:'easeInOut'}}/><motion.div className="orb-ring" animate={!reduce?{rotate:360}:undefined} transition={{duration:active?5:24,repeat:Infinity,ease:'linear'}}/><div className="orb-core"/><div className="orb-glint"/></div>
}
