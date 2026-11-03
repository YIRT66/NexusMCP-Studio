import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {readText,fileHash} from '../preserved-mcp/files.mjs';
const exec=promisify(execFile),ignored=new Set(['node_modules','.git','.cache','dist','build','vendor','.venv','__pycache__']);
export async function git(workspace,args){if(typeof workspace!=='string'||!path.isAbsolute(workspace))throw new Error('请先选择项目绝对路径');const {stdout}=await exec('git',['-C',workspace,...args],{timeout:60000,maxBuffer:4*1024*1024,windowsHide:true});return stdout;}
export async function gitStatus(workspace){const root=await fs.realpath((await git(workspace,['rev-parse','--show-toplevel'])).trim());const [raw,branch]=await Promise.all([git(root,['status','--porcelain=v1','-z','--untracked-files=normal']),git(root,['branch','--show-current'])]);const parts=raw.split('\0'),files=[];for(let i=0;i<parts.length;i++){const line=parts[i];if(!line)continue;const status=line.slice(0,2),relative=line.slice(3);let previous;if(/[RC]/.test(status))previous=parts[++i];files.push({path:relative,absolute:path.join(root,relative),status,previous,staged:status[0]!==' '&&status[0]!=='?',untracked:status==='??'});}return {root,branch:branch.trim()||'detached HEAD',files};}
async function canonical(file){let current=file;const tail=[];for(;;){try{return path.join(await fs.realpath(current),...tail);}catch(error){if(error.code!=='ENOENT')throw error;const parent=path.dirname(current);if(parent===current)throw error;tail.unshift(path.basename(current));current=parent;}}}
async function relative(root,file){const value=path.relative(await fs.realpath(root),await canonical(path.resolve(root,file)));if(!value||value.startsWith('..'+path.sep)||value==='..'||path.isAbsolute(value))throw new Error('请选择项目中的文件');return value;}
async function version(file){try{const stat=await fs.stat(file);return stat.size<=2*1024*1024?fileHash(await fs.readFile(file)):undefined;}catch(error){if(error.code==='ENOENT')return 'missing';throw error;}}
export async function gitDiff(workspace,file,staged=false){const {root}=await gitStatus(workspace),target=await relative(root,file);const before=await version(path.join(root,target));const tracked=(await git(root,['ls-files','--',target])).trim();if(!tracked){const value=await readText(path.join(root,target),{maxLines:1000,maxBytes:160000});const after=await version(path.join(root,target));if(before!==after)throw new Error('文件在预览时变化，请刷新差异');return {path:target,untracked:true,text:value.text,truncated:value.truncated,hash:after};}const text=await git(root,['diff',...(staged?['--cached']:[]),'--no-ext-diff','--',target]);const after=await version(path.join(root,target));if(before!==after)throw new Error('文件在预览时变化，请刷新差异');return {path:target,text,hash:after};}
export async function gitAction(workspace,{action,file,message,expectedHash},directory){const {root}=await gitStatus(workspace);const target=file?await relative(root,file):undefined;
 if(['stage','unstage','discard'].includes(action)&&!target)throw new Error('请选择一个文件');
 if(action==='stage')await git(root,['add','--',target]);
 else if(action==='unstage')await git(root,['restore','--staged','--',target]);
 else if(action==='discard'){const current=await version(path.join(root,target));if(!expectedHash||current!==expectedHash)throw new Error('文件已变化，请重新预览再撤销');if(!(await git(root,['ls-files','--',target])).trim())await fs.unlink(path.join(root,target));else await git(root,['restore','--worktree','--',target]);}
 else if(action==='commit'){if(typeof message!=='string'||!message.trim()||message.length>4000)throw new Error('请填写提交说明');await git(root,['commit','-m',message]);}
 else if(action==='push')await git(root,['push']);
 else if(action==='worktree'){const id=randomUUID().slice(0,8),destination=path.join(directory,'worktrees',id);await fs.mkdir(path.dirname(destination),{recursive:true});await git(root,['worktree','add','-b','nexus/task-'+id,destination,'HEAD']);return {path:destination,branch:'nexus/task-'+id};}
 else throw new Error('不支持的 Git 操作');
 return gitStatus(root);
}
export async function findFiles(workspace,query=''){if(!workspace||!path.isAbsolute(workspace))throw new Error('请先选择项目');const root=await fs.realpath(workspace),queue=[root],files=[];let visited=0;while(queue.length&&visited<5000&&files.length<150){const directory=queue.shift();for(const entry of await fs.readdir(directory,{withFileTypes:true}).catch(()=>[])){if(++visited>5000)break;if(ignored.has(entry.name)||entry.name.startsWith('.nexus-'))continue;const target=path.join(directory,entry.name);if(entry.isDirectory())queue.push(target);else if(entry.isFile()&&path.relative(root,target).toLowerCase().includes(query.toLowerCase()))files.push({path:target,relative:path.relative(root,target)});}}return {files,truncated:queue.length>0||files.length>=150};}
