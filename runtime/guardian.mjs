// Restart only the control plane, in paused mode. Never replay a user's task.
import {fork,spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import platform from '../preserved-mcp/platform.cjs';
import {Faults} from './faults.mjs';
const directory=path.resolve(process.env.NEXUS_DATA_DIR||platform.dataDirectory()),faults=new Faults(directory);await faults.init();
let child,closing=false,lastBeat=Date.now(),port=process.env.NEXUS_PORT,restarts=0,tail='',workers=[];
function killTree(){if(!child)return;if(process.platform==='win32')spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true}).on('error',()=>child.kill());else {for(const pid of workers)try{process.kill(-pid,'SIGKILL');}catch{}try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}}
function launch(){lastBeat=Date.now();child=fork(fileURLToPath(new URL('./server.mjs',import.meta.url)),[],{cwd:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),detached:process.platform!=='win32',env:{...process.env,NEXUS_DATA_DIR:directory,...(port?{NEXUS_PORT:port}:{})},stdio:['ignore','pipe','pipe','ipc']});
 for(const [stream,output] of [[child.stdout,process.stdout],[child.stderr,process.stderr]])stream.on('data',chunk=>{tail=(tail+chunk).slice(-32000);output.write(chunk);void faults.log('guardian',chunk);});
 child.on('message',message=>{if(message.type==='runtime.heartbeat'){lastBeat=Date.now();workers=message.workers||[];return;}if(message.type==='runtime.ready'){port=String(message.port);lastBeat=Date.now();}if(process.connected)process.send(message);});
 child.on('error',error=>void faults.report(error,'进程启动'));
 child.on('exit',async(code,signal)=>{if(closing){await faults.queue;process.exit(code||0);}await faults.init();await faults.report(new Error(`服务进程退出：code=${code}, signal=${signal}\n${tail}`),'服务进程守护');if(++restarts>2){console.error('服务无法恢复控制界面，请查看 '+faults.directory);process.exit(1);}setTimeout(launch,500);});
}
const watcher=setInterval(()=>{if(child&&Date.now()-lastBeat>45000&&!closing){lastBeat=Date.now();void faults.report(new Error('服务心跳超过 45 秒未响应，已停止进程并暂停任务。\n'+tail),'进程无响应').then(killTree);}},5000);watcher.unref();
function stop(){if(closing)return;closing=true;clearInterval(watcher);if(child?.connected)child.send({type:'shutdown'});else child?.kill();setTimeout(killTree,10000).unref();}
process.on('message',message=>{if(message?.type==='shutdown')stop();else if(child?.connected)child.send(message);});process.on('SIGINT',stop);process.on('SIGTERM',stop);if(process.send)process.on('disconnect',()=>{if(!closing)void faults.report(new Error('桌面主进程意外断开，工作已暂停'),'桌面进程').finally(stop);else stop();});launch();
