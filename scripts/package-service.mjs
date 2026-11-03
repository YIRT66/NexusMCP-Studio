import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'release');
const target=path.join(output,'NexusMCP-Service');
const expected=path.relative(output,target);
if(expected!=='NexusMCP-Service'||!path.isAbsolute(target))throw new Error('服务输出路径校验失败');
const runtimeFiles=(await fs.readdir(path.join(root,'runtime'))).filter(file=>file.endsWith('.mjs')&&!/\.test\.mjs$|-smoke\.mjs$|-fixture\.mjs$/.test(file));
for(const file of ['server.mjs','extensions.mjs','extension-install.mjs','webchat-relay.mjs','client-replies.mjs','api-models.mjs','dsh-runtime.mjs','public-access.mjs'])if(!runtimeFiles.includes(file))throw new Error('缺少服务模块：'+file);
const nodeName=process.platform==='win32'?'node.exe':'node';
const tunnelName=process.platform==='win32'?'cloudflared.exe':'cloudflared';
const required=['platform.cjs','linux-system.mjs','server.mjs','tools.mjs','browser.mjs','page-control.mjs','extension-bridge.mjs',`runtime/${nodeName}`,`bin/${tunnelName}`,'node_modules/@modelcontextprotocol/sdk/package.json','node_modules/@lydell/node-pty/package.json','node_modules/playwright-core/package.json','node_modules/ws/package.json','node_modules/npm/bin/npm-cli.js','node_modules/isomorphic-git/package.json','node_modules/fflate/package.json','node_modules/yaml/package.json','node_modules/@deepseek-ai/dsh/package.json','node_modules/dsh-whale-musume/package.json'];
for(const file of required)await fs.access(path.join(root,'preserved-mcp',file));
// Rebuild only this validated generated directory; stale links must not point back into source.
await fs.rm(target,{recursive:true,force:true});
await fs.mkdir(target,{recursive:true});
await fs.copyFile(path.join(root,'package.json'),path.join(target,'package.json'));
await fs.cp(path.join(root,'preserved-mcp'),path.join(target,'preserved-mcp'),{recursive:true,verbatimSymlinks:true,filter:source=>{
 const rel=path.relative(path.join(root,'preserved-mcp'),source).replaceAll('\\','/');
 return !/^(data|test|tests|\.git)(\/|$)/.test(rel)&&!['PUBLIC-MCP-URL.txt','.gitignore'].includes(rel);
}});
for(const file of ['nexus-shell/client.js','nexus-shell/client.css','nexus-shell/host.mjs','nexus-shell/session-records.mjs','whale-adapter/client.js'])await fs.access(path.join(root,'harness',file));
await fs.cp(path.join(root,'harness'),path.join(target,'harness'),{recursive:true});
await fs.cp(path.join(root,'examples'),path.join(target,'examples'),{recursive:true});
await fs.mkdir(path.join(target,'runtime'),{recursive:true});
await fs.cp(path.join(root,'browser-plugin'),path.join(target,'browser-plugin'),{recursive:true});
await fs.cp(path.join(root,'frontend/dist'),path.join(target,'frontend/dist'),{recursive:true});
for(const file of ['turn-tracker.js','debug-controller.js'])await fs.access(path.join(target,'browser-plugin',file));
for(const file of runtimeFiles)await fs.copyFile(path.join(root,'runtime',file),path.join(target,'runtime',file));
await fs.writeFile(path.join(target,'package-manifest.json'),JSON.stringify({builtAt:new Date().toISOString(),platform:process.platform,arch:process.arch,runtimeFiles},null,2));
await fs.copyFile(path.join(root,'docs/CLIENT-SERVICE-INTEGRATION.md'),path.join(target,'客户端接入说明.md'));
await fs.copyFile(path.join(root,'docs/SERVICE-README.md'),path.join(target,'使用说明.md'));
await fs.mkdir(path.join(target,'docs'),{recursive:true});
await fs.copyFile(path.join(root,'docs/LINUX.md'),path.join(target,'docs/LINUX.md'));
await fs.copyFile(path.join(root,'docs/WORKSPACE-FEATURES.md'),path.join(target,'docs/WORKSPACE-FEATURES.md'));
await fs.copyFile(path.join(root,'docs/HARNESS-COMPATIBILITY.md'),path.join(target,'docs/HARNESS-COMPATIBILITY.md'));
await fs.copyFile(path.join(root,'docs/EXTENSIONS-API.md'),path.join(target,'插件与技能接口.md'));
if(process.platform==='win32'){
await fs.writeFile(path.join(target,'START-SERVICE.bat'),'@echo off\r\nchcp 65001 >nul\r\ncd /d "%~dp0"\r\npreserved-mcp\\runtime\\node.exe runtime\\server.mjs\r\npause\r\n');
await fs.writeFile(path.join(target,'START-MCP.bat'),'@echo off\r\nchcp 65001 >nul\r\ncd /d "%~dp0preserved-mcp"\r\nruntime\\node.exe server.mjs\r\npause\r\n');
}else{
 const launcher=(script)=>'#!/usr/bin/env bash\nset -euo pipefail\ncd -- "$(dirname -- "$0")"\nexec ./preserved-mcp/runtime/node '+script+'\n';
 await fs.writeFile(path.join(target,'start-service.sh'),launcher('runtime/server.mjs'),{mode:0o755});
 await fs.writeFile(path.join(target,'start-mcp.sh'),launcher('preserved-mcp/server.mjs'),{mode:0o755});
 await fs.chmod(path.join(target,'preserved-mcp/runtime/node'),0o755);
 await fs.chmod(path.join(target,'preserved-mcp/bin/cloudflared'),0o755);
}
// 从复制后的目录解析依赖，确保不存在对源码项目或 HanCode 的符号链接依赖。
const require=createRequire(path.join(target,'preserved-mcp/package.json'));
for(const dependency of ['express','ws','playwright-core','@lydell/node-pty','@modelcontextprotocol/sdk/server/mcp.js']){
 const resolved=require.resolve(dependency);
 if(path.relative(target,resolved).startsWith('..'))throw new Error('依赖未包含在服务包中：'+dependency);
}
console.log('独立服务目录：'+target);
if(process.argv.includes('--zip')){
 const zip=path.join(output,'NexusMCP-Service.zip');
 const command=process.platform==='win32'?'tar.exe':'tar';
 const args=process.platform==='win32'?['-a','-cf',zip,'-C',output,'NexusMCP-Service']:['-czf',zip.replace(/\.zip$/,'.tar.gz'),'-C',output,'NexusMCP-Service'];
 await new Promise((resolve,reject)=>{const child=spawn(command,args,{windowsHide:true,stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('服务压缩失败：'+code)))});
 console.log('服务压缩包：'+(process.platform==='win32'?zip:zip.replace(/\.zip$/,'.tar.gz')));
}
