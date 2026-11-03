import {promises as fs} from 'node:fs';
import fsNative from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const engine=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../preserved-mcp');
const require=createRequire(path.join(engine,'package.json'));
const {unzipSync}=require('fflate');
const YAML=require('yaml');
const git=require('isomorphic-git');
const http=require('isomorphic-git/http/node');
const node=(await import('../preserved-mcp/platform.cjs')).default.runtimePaths(engine).node;
const children=new Set();
let aborted=false;
process.once('SIGTERM',()=>{aborted=true;for(const c of children)c.kill();process.exit(1)});
process.once('disconnect',()=>{aborted=true;for(const c of children){if(process.platform==='win32')spawn('taskkill.exe',['/PID',String(c.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else c.kill()}setTimeout(()=>process.exit(1),300).unref()});
let lastProgress=0;
const progress=text=>{if(Date.now()-lastProgress<200)return;lastProgress=Date.now();process.send?.({type:'progress',text:String(text).slice(-2500)})};
const inside=(base,target)=>{const rel=path.relative(base,target);if(rel.startsWith('..')||path.isAbsolute(rel))throw new Error('扩展路径超出安装目录');return target};
export const within=(base,relative)=>inside(base,path.resolve(base,relative));
const json=async file=>{try{return JSON.parse(await fs.readFile(file,'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw new Error('JSON 配置无效：'+path.basename(file))}};
async function run(command,args,cwd,timeout=180000){
 if(aborted)throw new Error('安装已取消');
 return new Promise((resolve,reject)=>{let output='';const child=spawn(command,args,{cwd,windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',PIP_NO_INPUT:'1',npm_config_ignore_scripts:'true'},stdio:['ignore','pipe','pipe']});children.add(child);const timer=setTimeout(()=>{child.kill();reject(new Error('安装命令超时'))},timeout);const collect=chunk=>{output=(output+chunk).slice(-8000);progress(chunk)};child.stdout.on('data',collect);child.stderr.on('data',collect);child.once('error',e=>{clearTimeout(timer);children.delete(child);reject(new Error('无法启动 '+path.basename(command)+'：'+e.message))});child.once('exit',code=>{clearTimeout(timer);children.delete(child);code===0?resolve(output):reject(new Error('安装命令失败：'+output.slice(-3000)))})});
}
async function python(){
 for(const entry of [[process.env.NEXUS_PYTHON_PATH,[]],['python.exe',[]],['py.exe',['-3']],['python3',[]]]){if(!entry[0])continue;try{await run(entry[0],[...entry[1],'-c','import sys; assert sys.version_info >= (3, 11); print(sys.executable)'],engine,10000);return entry}catch{}}
 throw new Error('Python 扩展需要 Python 3.11+。请安装 Python，或设置 NEXUS_PYTHON_PATH。Node/MCP/技能不需要 Python。');
}
async function copyTree(source,destination){
 let total=0,count=0;
 const real=await fs.realpath(source);const target=path.resolve(destination);
 if(target===real||target.startsWith(real+path.sep))throw new Error('安装来源不能包含服务自己的扩展目录，请选择具体的插件目录');
 async function walk(from,to){if(aborted)throw new Error('安装已取消');const stat=await fs.lstat(from);if(stat.isSymbolicLink())throw new Error('本地扩展含符号链接，请先导出不带链接的插件包');if(++count>30000)throw new Error('扩展超过 30000 个文件');if(stat.isDirectory()){await fs.mkdir(to,{recursive:true});for(const e of await fs.readdir(from)){if(['.git','.svn'].includes(e))continue;await walk(path.join(from,e),path.join(to,e))}}else if(stat.isFile()){total+=stat.size;if(total>512*1024*1024)throw new Error('本地扩展超过 512 MB');await fs.mkdir(path.dirname(to),{recursive:true});await fs.copyFile(from,to)}}
 await walk(real,target);
}
async function extractZip(file,destination){
 const stat=await fs.stat(file);if(stat.size>64*1024*1024)throw new Error('ZIP 压缩包不能超过 64 MB');
 let bytes=0,count=0;
 const files=unzipSync(new Uint8Array(await fs.readFile(file)),{filter:e=>{if(++count>10000||((bytes+=e.originalSize)>256*1024*1024))throw new Error('ZIP 展开后超过 256 MB 或 10000 个条目');if(e.name.includes('\\')||e.name.includes(':')||e.name.startsWith('/')||e.name.split('/').includes('..'))throw new Error('ZIP 含有不安全的文件路径');within(destination,e.name);return true}});
 for(const [name,content] of Object.entries(files)){const target=within(destination,name);if(name.endsWith('/')){await fs.mkdir(target,{recursive:true});continue}await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,content)}
}
async function githubSnapshot(url,ref,destination){
 const parts=url.pathname.replace(/\.git$/,'').split('/').filter(Boolean);if(url.hostname!=='github.com'||parts.length!==2)throw new Error('Git HTTP 克隆失败，此来源不支持 GitHub 快照回退');
 progress('Git 协议超时，改用 GitHub 官方仓库快照');
 const headers={'user-agent':'NexusMCP-Studio'};if(url.username||url.password)headers.authorization='Basic '+Buffer.from(decodeURIComponent(url.username)+':'+decodeURIComponent(url.password)).toString('base64');
 if(!ref){try{const response=await fetch(`https://api.github.com/repos/${parts.join('/')}`,{headers,signal:AbortSignal.timeout(15000)});if(response.ok)ref=(await response.json()).default_branch}catch{}}
 const response=await fetch(`https://codeload.github.com/${parts.join('/')}/zip/${encodeURIComponent(ref||'HEAD')}`,{headers,signal:AbortSignal.timeout(90000)});if(!response.ok)throw new Error('下载 GitHub 仓库快照失败：HTTP '+response.status);
 let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>64*1024*1024)throw new Error('GitHub 快照压缩包超过 64 MB');chunks.push(chunk)}
 const file=path.join(destination,'snapshot.zip');const unpack=path.join(destination,'github-snapshot');await fs.writeFile(file,Buffer.concat(chunks));await fs.mkdir(unpack,{recursive:true});await extractZip(file,unpack);await fs.rm(file);return unwrap(unpack);
}
async function unwrap(directory){const entries=await fs.readdir(directory,{withFileTypes:true});const content=entries.filter(e=>e.name!=='__MACOSX');return content.length===1&&content[0].isDirectory()?path.join(directory,content[0].name):directory}
async function discoverSkills(directory,base=directory,depth=0,result=[]){
 if(depth>6||result.length>=200)return result;
 const entries=await fs.readdir(directory,{withFileTypes:true});
 for(const entry of entries){if(['node_modules','.git','.venv','venv','__pycache__'].includes(entry.name))continue;const file=path.join(directory,entry.name);if(entry.isSymbolicLink())throw new Error('扩展技能目录不允许符号链接');if(entry.isDirectory())await discoverSkills(file,base,depth+1,result);else if(entry.name.toLowerCase()==='skill.md'){
 const stat=await fs.stat(file);if(stat.size>256*1024)throw new Error('SKILL.md 不能超过 256 KB');const content=await fs.readFile(file,'utf8');const match=content.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);const meta=match?YAML.parse(match[1],{maxAliasCount:30})||{}:{};
 result.push({name:String(meta.name||path.basename(directory)).slice(0,150),description:String(meta.description||'自定义技能').slice(0,1000),relative:path.relative(base,file)});
 }}return result;
}
async function readManifest(directory){
 for(const name of ['nexus-plugin.json','plugin.json','.claude-plugin/plugin.json','.codex-plugin/plugin.json','dsh-plugin.json','.dsh-plugin/plugin.json']){const value=await json(path.join(directory,name));if(value)return value}
 return {};
}
async function inspect(directory,kind){
 const manifest=await readManifest(directory);const pkg=await json(path.join(directory,'package.json'))||{};
 let config=manifest.mcpServers||pkg.mcpServers;
 for(const name of ['.mcp.json','mcp.json','.dsh/mcp.json']){const value=await json(path.join(directory,name));if(value){config=value.mcpServers||value;break}}
 if(!config&&manifest.mcp)config={default:manifest.mcp};
 if(!config&&pkg.nexusMcp)config={default:typeof pkg.nexusMcp==='string'?{command:'node',args:[pkg.nexusMcp]}:pkg.nexusMcp};
 if(!config&&pkg.bin){const bin=typeof pkg.bin==='string'?pkg.bin:Object.values(pkg.bin)[0];if(bin)config={default:{command:'node',args:[bin]}}}
 const servers=[];
 if(kind!=='skill'&&config){if(typeof config!=='object'||Array.isArray(config))throw new Error('mcpServers 必须是对象');for(const [name,value] of Object.entries(config)){if(!value||typeof value!=='object')throw new Error('MCP 配置格式无效');if(value.url){const url=new URL(value.url);if(!['http:','https:'].includes(url.protocol))throw new Error('MCP 地址仅支持 HTTP/HTTPS');servers.push({name,url:url.href,headers:value.headers||{}})}else if(typeof value.command==='string'&&value.command){if(value.args&&!Array.isArray(value.args))throw new Error('MCP args 必须是数组');servers.push({name,command:value.command,args:value.args||[],env:value.env||{},cwd:value.cwd})}else throw new Error('MCP 服务缺少 url 或 command')}}
 if(servers.length>20)throw new Error('单个扩展最多配置 20 个 MCP 服务');
 let studio;
 if(manifest.studio){
  const config=manifest.studio;if(!Array.isArray(config.permissions)||!config.permissions.includes('full'))throw new Error('Studio 插件需声明 permissions:["full"]，可修改界面及运行时');
  studio={permissions:['full']};for(const key of ['frontend','backend','styles'])if(config[key]){if(typeof config[key]!=='string')throw new Error('Studio 入口必须是相对路径');const target=within(directory,config[key]);if(!(await fs.stat(target)).isFile())throw new Error('Studio 入口不存在');studio[key]=config[key];}
  if(!studio.frontend&&!studio.backend&&!studio.styles)throw new Error('Studio 插件缺少入口');
 }
 const skills=await discoverSkills(directory);
 const dsh=pkg.dsh?{engines:pkg.engines?.dsh||'',bundle:!!pkg.dsh.bundle,client:!!pkg.dsh.client}:undefined;
 if(!servers.length&&!skills.length&&!studio&&!dsh)throw new Error('未发现可用入口。技能需要 SKILL.md；插件需要 nexus-plugin.json / .mcp.json、package.json 的 nexusMcp/bin 或技能目录。');
 return {name:String(manifest.name||pkg.name||(kind==='skill'&&skills.length===1?skills[0].name:null)||path.basename(directory)).slice(0,150),description:String(manifest.description||pkg.description||(kind==='skill'&&skills.length===1?skills[0].description:'')).slice(0,2000),version:String(manifest.version||pkg.version||'1.0.0').slice(0,80),servers,skills,studio,dsh};
}
export async function installExtension(job){
 const {destination,body}=job;await fs.mkdir(destination,{recursive:true});let directory=destination;let pythonPath;
 const {type,value}=body.source;
 if(type==='local'){
  if(!path.isAbsolute(value))throw new Error('请选择本地绝对路径');const stat=await fs.lstat(value);
  if(stat.isDirectory())await copyTree(value,destination);
  else if(stat.isFile()&&/\.zip$/i.test(value)){await extractZip(value,destination);directory=await unwrap(destination)}
  else if(stat.isFile()&&/\.md$/i.test(value)){if(body.kind!=='skill'&&!/SKILL\.md$/i.test(value))throw new Error('插件 Markdown 入口需要 SKILL.md');await fs.copyFile(value,path.join(destination,'SKILL.md'));for(const name of ['scripts','references','assets']){const from=path.join(path.dirname(value),name);if(await fs.stat(from).then(s=>s.isDirectory()).catch(()=>false))await copyTree(from,path.join(destination,name))}}
  else if(stat.isFile()&&/\.(?:mjs|cjs|js|py)$/i.test(value)){await fs.copyFile(value,path.join(destination,path.basename(value)));const isPython=/\.py$/i.test(value);if(isPython){const py=await python();pythonPath=py[0];await fs.writeFile(path.join(destination,'nexus-plugin.json'),JSON.stringify({name:path.basename(value),mcp:{command:py[0],args:[...py[1],path.basename(value)]}}))}else{await fs.writeFile(path.join(destination,'nexus-plugin.json'),JSON.stringify({name:path.basename(value),mcp:{command:'node',args:[path.basename(value)]}}));const adjacent=await json(path.join(path.dirname(value),'package.json'));if(adjacent)await fs.writeFile(path.join(destination,'package.json'),JSON.stringify(adjacent));else {const code=await fs.readFile(value,'utf8');const dependencies={};if(code.includes('@modelcontextprotocol/sdk'))dependencies['@modelcontextprotocol/sdk']='1.32.2';if(/['"]zod(?:\/[^'"]*)?['"]/.test(code))dependencies.zod='3.25.76';if(Object.keys(dependencies).length)await fs.writeFile(path.join(destination,'package.json'),JSON.stringify({private:true,type:/\.cjs$/i.test(value)?'commonjs':'module',dependencies}));}}}
  else if(stat.isFile()&&/\.json$/i.test(value)){const config=await json(value);await fs.writeFile(path.join(destination,'nexus-plugin.json'),JSON.stringify(config.mcpServers||config.mcp?config:{name:path.basename(value),mcp:config}));}
  else throw new Error('支持文件夹、SKILL.md/Markdown、ZIP、MCP JSON、JavaScript 或 Python MCP 文件');
 }else if(type==='git'){
  if(/^https?:\/\//i.test(value)){const url=new URL(value);const ref=decodeURIComponent(url.hash.slice(1))||undefined;url.hash='';progress('正在克隆 Git 仓库');try{await git.clone({fs:fsNative,http,dir:destination,url:url.href,ref,singleBranch:true,depth:1,noTags:true,onAuth:()=>({username:decodeURIComponent(url.username),password:decodeURIComponent(url.password)}),onProgress:e=>progress(`${e.phase} ${e.loaded}/${e.total||'?'}`)});}catch(e){if(url.hostname==='github.com')directory=await githubSnapshot(url,ref,destination);else throw e}}
  else if(/^(?:ssh:\/\/|git@)/i.test(value)){await run('git',['clone','--depth','1','--',value,destination],path.dirname(destination));}
  else throw new Error('Git 来源需要 HTTPS 或 SSH 仓库地址');
 }else if(type==='registry'){
  if(value.startsWith('npm:')){
   const spec=value.slice(4);if(!/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+(?:@[a-zA-Z0-9_.^~*+<>=| -]+)?$/.test(spec))throw new Error('npm 包名无效，例如 npm:@scope/package@1.0.0');
   await fs.writeFile(path.join(destination,'package.json'),JSON.stringify({private:true}));
   await run(node,[path.join(engine,'node_modules/npm/bin/npm-cli.js'),'install','--prefix',destination,'--ignore-scripts','--omit=dev','--no-audit','--no-fund','--save-exact','--',spec],destination);
   const pkg=await json(path.join(destination,'package.json'));directory=within(destination,path.join('node_modules',Object.keys(pkg.dependencies||{})[0]||''));
  }else if(value.startsWith('pypi:')){
   const spec=value.slice(5);if(!/^[a-zA-Z0-9_.-]+(?:\[[a-zA-Z0-9_,.-]+\])?(?:(?:==|>=|<=|~=)[a-zA-Z0-9_.+-]+)?$/.test(spec))throw new Error('PyPI 包名无效，例如 pypi:package==1.0.0');
   const py=await python();const venv=path.join(destination,'.venv');await run(py[0],[...py[1],'-m','venv',venv],destination);
   pythonPath=path.join(venv,process.platform==='win32'?'Scripts/python.exe':'bin/python');
   await run(pythonPath,['-m','pip','install','--disable-pip-version-check','--only-binary=:all:','--',spec],destination);
   const name=spec.match(/^[a-zA-Z0-9_.-]+/)[0];const code='import importlib.metadata as m,json; d=m.distribution('+JSON.stringify(name)+'); print(json.dumps({"name":d.metadata["Name"],"version":d.version,"description":d.metadata["Summary"],"entrypoints":[e.name for e in d.entry_points if e.group=="console_scripts"]}))';
   const meta=JSON.parse((await run(pythonPath,['-c',code],destination)).trim().split(/\r?\n/).at(-1));if(!meta.entrypoints.length)throw new Error('PyPI 包没有可启动的 console_scripts MCP 入口');
   const entry=meta.entrypoints[0];await fs.writeFile(path.join(destination,'nexus-plugin.json'),JSON.stringify({name:meta.name,version:meta.version,description:meta.description,mcp:{command:pythonPath,args:['-c','import importlib.metadata as m; next(e for e in m.distribution('+JSON.stringify(name)+').entry_points if e.group=="console_scripts" and e.name=='+JSON.stringify(entry)+').load()()']}}));
  }else throw new Error('包来源需要 npm: 或 pypi: 前缀');
 }else throw new Error('不支持的安装来源');
 // 克隆仓库的符号链接也不允许成为技能/启动配置的越界入口。
 const metadata=await inspect(directory,body.kind);if(metadata.name===path.basename(directory)&&type==='local')metadata.name=path.basename(value).replace(/\.(?:zip|json)$/i,'');const pkg=await json(path.join(directory,'package.json'));
 if(type!=='registry'&&pkg&&Object.keys(pkg.dependencies||{}).length){progress('正在安装插件声明的 Node 依赖（跳过安装脚本）');await run(node,[path.join(engine,'node_modules/npm/bin/npm-cli.js'),'install','--prefix',directory,'--ignore-scripts','--omit=dev','--no-audit','--no-fund'],directory)}
 return {...metadata,root:path.relative(destination,directory),pythonPath};
}
if(process.send)process.once('message',async job=>{try{const result=await installExtension(job);process.send({type:'installed',result},()=>process.exit(0))}catch(e){process.send({type:'failed',error:e.message},()=>process.exit(1))}});
