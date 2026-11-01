import {createServer,request as httpRequest} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {ensureCloudflared,startTunnel} from '../preserved-mcp/tunnel.mjs';
const require=createRequire(new URL('../preserved-mcp/package.json',import.meta.url));
const {WebSocket,WebSocketServer}=require('ws');
const equal=(left,right)=>typeof left==='string'&&typeof right==='string'&&/^[a-f0-9]{64}$/.test(left)&&/^[a-f0-9]{64}$/.test(right)&&timingSafeEqual(Buffer.from(left),Buffer.from(right));
export class PublicAccess {
 constructor(directory,{target,publish=()=>{},relaySecret,tunnelFactory,cloudflared}){this.directory=path.join(directory,'public-access');this.target=new URL(target);this.publish=publish;this.relaySecret=relaySecret;this.tunnelFactory=tunnelFactory;this.cloudflared=cloudflared;this.server=null;this.tunnel=null;this.peers=new Set();this.clients=new Set();this.state={phase:'stopped',url:'',error:'',startedAt:0,connections:0};this.generation=0;}
 snapshot(){return {...this.state};}
 update(patch){Object.assign(this.state,patch);this.publish('public-access.state',this.snapshot());}
 authorized(req){const bearer=req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):'';const cookie=(req.headers.cookie||'').split(';').map(value=>value.trim()).find(value=>value.startsWith(this.cookieName+'='))?.slice(this.cookieName.length+1);return equal(bearer,this.token)||equal(cookie,this.token);}
 originAllowed(req){if(!req.headers.origin)return req.method==='GET'||req.method==='HEAD'||req.headers.authorization?.startsWith('Bearer ');return [this.publicOrigin,`http://127.0.0.1:${this.port}`,`http://localhost:${this.port}`].includes(req.headers.origin);}
 allowedHost(req){return this.hosts.has(req.headers.host);}
 async start(){
  if(this.server||this.state.phase==='starting')return this.snapshot();const generation=++this.generation;
  this.token=randomBytes(32).toString('hex');this.accessId=randomBytes(12).toString('hex');this.cookieName='nexus_share_'+this.accessId;this.publicOrigin='';this.hosts=new Set();this.update({phase:'starting',url:'',error:'',connections:0});
  try{
   await fs.mkdir(path.join(this.directory,'data'),{recursive:true});await fs.writeFile(path.join(this.directory,'data/quick-tunnel.yml'),'{}\n');
   if(generation!==this.generation)return this.snapshot();
   const server=createServer((req,res)=>this.serve(req,res));this.server=server;
   server.on('connection',socket=>{this.peers.add(socket);socket.once('close',()=>this.peers.delete(socket));});
   const wss=new WebSocketServer({noServer:true,maxPayload:1024*1024});this.wss=wss;
   server.on('upgrade',(req,socket,head)=>{
    if(!this.allowedHost(req)||!this.authorized(req)||!this.originAllowed(req)||req.url!=='/ws'){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
    wss.handleUpgrade(req,socket,head,ws=>{
     const upstream=new WebSocket(this.target.href.replace(/^http/,'ws').replace(/\/$/,'')+'/ws',{headers:{origin:this.target.origin,'x-nexus-shared-access':this.relaySecret,'x-nexus-access-id':this.accessId},handshakeTimeout:5000,maxPayload:64*1024*1024});
     this.clients.add(ws);this.update({connections:this.clients.size});let queued=[],bytes=0;
     ws.on('message',(data,binary)=>{if(upstream.readyState===WebSocket.OPEN)upstream.send(data,{binary});else if(upstream.readyState===WebSocket.CONNECTING&&bytes+data.length<1024*1024){queued.push([data,binary]);bytes+=data.length;}});
     upstream.on('open',()=>{for(const[data,binary]of queued)upstream.send(data,{binary});queued=[];});
     upstream.on('message',(data,binary)=>{if(ws.readyState===WebSocket.OPEN&&ws.bufferedAmount<16*1024*1024)ws.send(data,{binary});});
     ws.once('close',()=>{this.clients.delete(ws);upstream.close();if(this.server)this.update({connections:this.clients.size});});
     ws.once('error',()=>upstream.close());upstream.once('close',()=>ws.close());upstream.once('error',()=>ws.close(1011,'本地服务连接失败'));
    });
   });
   await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});this.port=server.address().port;this.hosts.add('127.0.0.1:'+this.port);this.hosts.add('localhost:'+this.port);
   const executable=this.cloudflared||await ensureCloudflared(this.directory);if(generation!==this.generation)return this.snapshot();
   this.tunnel=this.tunnelFactory?this.tunnelFactory(executable,this.port,this.directory):startTunnel(executable,this.port,this.directory);
   const origin=await this.tunnel.ready;if(generation!==this.generation)return this.snapshot();const url=new URL(origin);if(url.protocol!=='https:')throw new Error('公网入口必须使用 HTTPS');
   this.publicOrigin=url.origin;this.hosts.add(url.host);this.update({phase:'running',url:url.origin+'/join/'+this.token,startedAt:Date.now(),error:''});
   this.tunnel.child.once('exit',()=>{if(this.server&&generation===this.generation)void this.stop('公网隧道已退出');});return this.snapshot();
  }catch(error){if(generation!==this.generation)return this.snapshot();await this.stop(error.message);throw error;}
 }
 serve(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
  if(!this.allowedHost(req)){res.writeHead(403).end('无效主机');return;}
  const join=req.url.match(/^\/join\/([a-f0-9]{64})$/);
  if(join&&req.method==='GET'&&equal(join[1],this.token)){
   const secure=true;res.setHeader('Set-Cookie',`${this.cookieName}=${this.token}; Path=/; HttpOnly; SameSite=Strict${secure?'; Secure':''}`);res.writeHead(302,{Location:'/'}).end();return;
  }
  if(!this.authorized(req)||!this.originAllowed(req)){res.writeHead(403,{'Content-Type':'text/plain; charset=utf-8'}).end('远程访问需要有效的分享链接。请向设备持有人索取当前链接。');return;}
  if(/^\/api\/(?:public-access|dsh)(?:\/|$)/.test(req.url)){res.writeHead(403,{'Content-Type':'application/json'}).end(JSON.stringify({error:'此设置仅可在本机修改'}));return;}
  const headers={...req.headers,host:this.target.host,origin:this.target.origin,'x-nexus-shared-access':this.relaySecret,'x-nexus-access-id':this.accessId};delete headers.authorization;delete headers.referer;
  const upstream=httpRequest({hostname:this.target.hostname,port:this.target.port,path:req.url,method:req.method,headers},response=>{
   const forwarded={...response.headers,'cache-control':'no-store','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; frame-ancestors 'none'"};delete forwarded['set-cookie'];res.writeHead(response.statusCode,forwarded);response.pipe(res);
  });
  upstream.once('error',()=>{if(!res.headersSent)res.writeHead(502,{'Content-Type':'text/plain; charset=utf-8'});res.end('本地控制服务不可用');});req.once('aborted',()=>upstream.destroy());res.once('close',()=>upstream.destroy());req.pipe(upstream);
 }
 async stop(error=''){
  const accessId=this.accessId;this.generation++;this.token='';this.tunnel?.child.kill();this.tunnel=null;const server=this.server;this.server=null;
  for(const ws of this.clients)ws.terminate();this.clients.clear();this.wss?.close();this.wss=null;for(const socket of this.peers)socket.destroy();this.peers.clear();if(server)await new Promise(resolve=>server.close(resolve));
  this.update({phase:error?'error':'stopped',url:'',error,connections:0,startedAt:0});if(accessId)this.publish('public-access.revoked',{accessId});
 }
}
