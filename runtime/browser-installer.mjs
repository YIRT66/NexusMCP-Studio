import {promises as fs} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../preserved-mcp/package.json',import.meta.url));
const {chromium}=require('playwright-core');
export class BrowserInstaller {
 constructor(directory,{source,bridge,connected,open,publish}){Object.assign(this,{directory,source,bridge,connected,open,publish});this.state={phase:'idle',progress:'',error:''};this.context=null;this.operation=null;}
 update(patch){Object.assign(this.state,patch);this.publish('browser-install.state',{...this.state});}
 install(data={}){if(this.operation)return this.operation;this.operation=this.run(data).catch(error=>{this.update({phase:'error',error:error.message,progress:''});throw error;}).finally(()=>this.operation=null);return this.operation;}
 async run(data){
  this.update({phase:'preparing',progress:'正在自动配置浏览器扩展',error:''});
  const extension=path.join(this.directory,'browser-extension'),profile=path.join(this.directory,'browser-profile');
  await this.context?.close();this.context=null;
  await fs.mkdir(this.directory,{recursive:true});await fs.cp(this.source,extension,{recursive:true});
  await fs.writeFile(path.join(extension,'managed-config.js'),'globalThis.NEXUS_MANAGED_BRIDGE='+JSON.stringify(this.bridge())+';\n',{mode:0o600});
  const executablePath=chromium.executablePath();
  try{await fs.access(executablePath);}catch{
   this.update({phase:'downloading',progress:'正在自动下载兼容 Chromium，首次需要一些时间'});
   const cli=path.join(path.dirname(require.resolve('playwright-core/package.json')),'cli.js');
   await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[cli,'install','chromium'],{stdio:['ignore','pipe','pipe'],windowsHide:true});let diagnostic='';const timer=setTimeout(()=>{child.kill();reject(new Error('浏览器下载超时，请检查网络后重试'));},600000);child.stdout.on('data',chunk=>{const text=chunk.toString().replace(/\x1b\[[0-9;]*m/g,'').trim();if(text)this.update({progress:text.slice(-250)});});child.stderr.on('data',chunk=>diagnostic=(diagnostic+chunk).slice(-1500));child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('浏览器安装失败：'+diagnostic));});});
  }
  this.update({phase:'launching',progress:'正在启动已安装扩展的浏览器并自动连接'});
  this.context=await chromium.launchPersistentContext(profile,{executablePath,headless:process.env.NEXUS_BROWSER_HEADLESS==='1',viewport:null,ignoreDefaultArgs:['--disable-extensions'],args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
  for(let i=0;i<100&&!this.connected();i++)await new Promise(resolve=>setTimeout(resolve,200));
  if(!this.connected())throw new Error('浏览器已打开，但扩展未能自动连接，请重试或使用手动连接');
  await this.open({provider:data.provider||'chatgpt',sessionId:data.sessionId||'default',foreground:true});
  this.update({phase:'ready',progress:'扩展已自动安装并连接，完成网页登录后即可使用',error:''});
  this.context.once('close',()=>{this.context=null;this.update({phase:'idle',progress:'浏览器已关闭，下次可一键恢复'});});
  return {...this.state};
 }
 async dispose(){await this.context?.close().catch(()=>{});this.context=null;}
}
