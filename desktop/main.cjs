const { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, net, protocol, screen, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {spawn}=require('node:child_process');
const {WebChat}=require('./webchat.cjs');
let runtimeProcess,runtimeUrl='http://127.0.0.1:8765',webchat;
async function startRuntime(){let savedPort=0;const portFile=path.join(app.getPath('userData'),'service-port.json');try{savedPort=JSON.parse(fs.readFileSync(portFile,'utf8')).port||0}catch{}if(savedPort){const probe=require('node:net').createServer();savedPort=await new Promise(resolve=>{probe.once('error',()=>resolve(0));probe.listen(savedPort,'127.0.0.1',()=>probe.close(()=>resolve(savedPort)))})}const base=app.isPackaged?path.join(process.resourcesPath,'service'):root;const node=require(path.join(base,'preserved-mcp/platform.cjs')).runtimePaths(path.join(base,'preserved-mcp')).node;runtimeProcess=spawn(node,[path.join(base,'runtime/server.mjs')],{cwd:base,windowsHide:true,stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,NEXUS_PORT:String(savedPort),NEXUS_DATA_DIR:path.join(app.getPath('userData'),'service'),NEXUS_DESKTOP_ORIGIN:appOrigin}});runtimeProcess.stdout.on('data',c=>console.log(c.toString().trim()));runtimeProcess.stderr.on('data',c=>console.error(c.toString().trim()));runtimeProcess.on('message',async message=>{if(message.type!=='webchat.command')return;try{if(!webchat)throw new Error('客户端浏览器尚未就绪');const result=await webchat.command(message.operation,message.data);if(runtimeProcess.connected)runtimeProcess.send({type:'webchat.result',id:message.id,result});}catch(e){if(runtimeProcess.connected)runtimeProcess.send({type:'webchat.result',id:message.id,error:e.message})}});await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('本地服务启动超时')),15000);runtimeProcess.on('message',m=>{if(m.type==='runtime.ready'){clearTimeout(timer);runtimeUrl=m.url;fs.writeFileSync(portFile,JSON.stringify({port:m.port}));resolve();}});runtimeProcess.once('error',e=>{clearTimeout(timer);reject(e)});runtimeProcess.once('exit',code=>{clearTimeout(timer);reject(new Error('本地服务退出 '+code))})});}

const development = !app.isPackaged && process.argv.includes('--dev');
const root = path.resolve(__dirname, '..');
const appOrigin = 'nexus://studio';
let mainWindow;
let devServer;
let closingServer = false;
let rendererOrigin = appOrigin;
const startupLog=path.join(app.getPath('userData'),'desktop-startup.log');
try{fs.mkdirSync(path.dirname(startupLog),{recursive:true});fs.writeFileSync(startupLog,'');}catch{}
function logStartup(stage,details={}){
  const line=JSON.stringify({at:new Date().toISOString(),stage,...details});
  try{fs.appendFileSync(startupLog,line+'\n');}catch{}
}
logStartup('main',{pid:process.pid,electron:process.versions.electron,development});

app.setName('NexusMCP Studio');
if(process.env.NEXUS_TEST_USER_DATA)app.setPath('userData',process.env.NEXUS_TEST_USER_DATA);
app.setAppUserModelId('com.nexusmcp.studio');
protocol.registerSchemesAsPrivileged([
  { scheme: 'nexus', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

function windowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function readWindowState() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(windowStatePath(), 'utf8')); } catch {}
  const display = screen.getAllDisplays().find(({ workArea: a }) =>
    Number.isFinite(saved.x) && Number.isFinite(saved.y) &&
    saved.x >= a.x && saved.x < a.x + a.width && saved.y >= a.y && saved.y < a.y + a.height,
  );
  const area = (display || screen.getPrimaryDisplay()).workArea;
  const width = Math.min(area.width, Math.max(900, Number.isFinite(saved.width) ? saved.width : 1440));
  const height = Math.min(area.height, Math.max(640, Number.isFinite(saved.height) ? saved.height : 940));
  return {
    width, height,
    minWidth: Math.min(900, area.width), minHeight: Math.min(640, area.height),
    ...(display ? {
      x: Math.min(saved.x, area.x + area.width - width),
      y: Math.min(saved.y, area.y + area.height - height),
    } : {}),
    maximized: saved.maximized === true,
  };
}

function saveWindowState() {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(windowStatePath(), JSON.stringify({
      ...mainWindow.getNormalBounds(), maximized: mainWindow.isMaximized(),
    }));
  } catch (error) { console.error('无法保存窗口位置：', error.message); }
}

function registerAppProtocol() {
  const dist = path.join(root, 'frontend', 'dist');
  protocol.handle('nexus', async (request) => {
    const url = new URL(request.url);
    if (url.host !== 'studio') return new Response('地址不存在', { status: 404 });
    // 桌面版的 API 仍同源；只转发到已约定的本机运行时。
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      try {
        return await net.fetch(`${runtimeUrl}${url.pathname}${url.search}`, {
          method: request.method,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
          signal: request.signal,
          redirect: 'error',
        });
      } catch {
        return Response.json({ detail: '本地运行时未启动，请先启动 127.0.0.1:8765 上的后端。' }, { status: 503 });
      }
    }
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
    let file;
    try { file = path.resolve(dist, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)); }
    catch { return new Response(null, { status: 400 }); }
    const relative = path.relative(dist, file);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return new Response(null, { status: 403 });
    try {
      const response = await net.fetch(pathToFileURL(file).href);
      const headers = new Headers(response.headers);
      headers.set('Content-Security-Policy', `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ${runtimeUrl.replace('http:','ws:')}; object-src 'none'; base-uri 'none'; frame-src 'none'`);
      return new Response(request.method === 'HEAD' ? null : response.body, {
        status: response.status, headers,
      });
    } catch { return new Response('资源不存在', { status: 404 }); }
  });
}

function openLink(url) {
  try {
    if (['https:', 'http:'].includes(new URL(url).protocol)) {
      void shell.openExternal(url).catch(error => console.error('无法打开链接：', error.message));
    }
  } catch {}
}

async function createWindow() {
  logStartup('window:create');
  const { maximized, ...bounds } = readWindowState();
  mainWindow = new BrowserWindow({
    ...bounds,
    title: 'NexusMCP Studio',
    backgroundColor: '#151517',
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#1b1b1c', symbolColor: '#ededed', height: 40 },
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  Menu.setApplicationMenu(null);
  webchat=new WebChat(mainWindow,(type,data)=>{if(runtimeProcess?.connected)runtimeProcess.send({type:'webchat.event',event:{type,data}})},path.join(app.getPath('userData'),'ai-webpages.json'));
  webchat.changed();
  mainWindow.on('page-title-updated', event => event.preventDefault());
  const window = mainWindow;
  let painted = false, uiReady = false, shown = false;
  const revealWindow = () => {
    if (!painted || !uiReady || shown || window.isDestroyed()) return;
    shown = true;clearTimeout(startupTimer);
    if (maximized) window.maximize();
    window.show();
  };
  const handleReady = event => {if(event.sender===window.webContents){logStartup('renderer:ready');uiReady=true;revealWindow();}};
  ipcMain.on('desktop:renderer-ready', handleReady);
  const startupTimer=setTimeout(()=>{if(!shown&&!window.isDestroyed()){shown=true;window.show();}},20000);
  mainWindow.once('ready-to-show', () => {logStartup('window:painted');painted=true;revealWindow();});
  window.on('show',()=>logStartup('window:shown',{visible:window.isVisible(),bounds:window.getBounds()}));
  window.webContents.on('did-start-loading',()=>logStartup('renderer:loading'));
  window.webContents.on('did-finish-load',()=>logStartup('renderer:loaded',{url:window.webContents.getURL()}));
  window.webContents.on('preload-error',(_event,file,error)=>logStartup('renderer:preload-error',{file,message:error.message}));
  window.webContents.on('render-process-gone',(_event,details)=>logStartup('renderer:gone',details));
  window.webContents.on('console-message',details=>{if(details.level==='error')logStartup('renderer:console-error',{message:details.message});});
  window.webContents.on('did-fail-load',(_event,code,message,url,isMainFrame)=>logStartup('renderer:load-failed',{code,message,url,isMainFrame}));
  const probe=setTimeout(async()=>{
    if(window.isDestroyed())return;
    logStartup('window:probe',{url:window.webContents.getURL(),loading:window.webContents.isLoading(),visible:window.isVisible(),painted,uiReady});
    try{
      const snapshot=await window.webContents.executeJavaScript("JSON.stringify({root:document.getElementById('root')?.children.length,app:!!document.querySelector('.desktop-shell'),ready:document.readyState})");
      logStartup('renderer:snapshot',{snapshot});
      if(process.env.NEXUS_DIAGNOSTICS==='1')fs.writeFileSync(path.join(app.getPath('userData'),'desktop-startup.png'),(await window.capturePage()).toPNG());
    }catch(error){logStartup('renderer:probe-error',{message:error.message});}
  },8000);
  window.once('closed',()=>clearTimeout(probe));
  mainWindow.on('close', saveWindowState);
  mainWindow.on('closed', () => { void webchat?.dispose();clearTimeout(startupTimer);ipcMain.removeListener('desktop:renderer-ready',handleReady);mainWindow = undefined; });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { openLink(url); return { action: 'deny' }; });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(rendererOrigin + '/')) { event.preventDefault(); openLink(url); }
  });
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === 'fullscreen'||permission === 'clipboard-sanitized-write'));
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (development && input.type === 'keyDown' && input.key === 'F12') {
      event.preventDefault(); mainWindow.webContents.toggleDevTools();
    }
  });
  logStartup('window:load',{url:rendererOrigin+'/'});
  await mainWindow.loadURL(rendererOrigin + '/');
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show(); mainWindow.focus();
  });
  app.whenReady().then(async () => {
    logStartup('app:ready');
    await startRuntime();
    logStartup('runtime:ready',{url:runtimeUrl});
    ipcMain.handle('desktop:get-runtime',event=>event.sender===mainWindow?.webContents?runtimeUrl:null);
    ipcMain.handle('desktop:open-browser-plugin',async event=>{
      if(event.sender!==mainWindow?.webContents)return;
      let directory=path.join(root,'browser-plugin');
      if(app.isPackaged){
        // 便携版的 resources 位于临时解压目录，扩展需保存在退出软件后仍存在的位置。
        directory=path.join(app.getPath('userData'),'browser-plugin');
        await fs.promises.cp(path.join(process.resourcesPath,'browser-plugin'),directory,{recursive:true});
      }
      const error=await shell.openPath(directory);if(error)throw new Error(error);return directory;
    });
    ipcMain.handle('webchat:command',async(event,operation,data)=>{if(event.sender!==mainWindow?.webContents)throw new Error('无效浏览器调用来源');return webchat.command(operation,data)});
    ipcMain.on('webchat:bounds',(event,rect)=>{if(event.sender!==mainWindow?.webContents)return;if(rect&&[rect.x,rect.y,rect.width,rect.height].every(Number.isFinite)&&rect.width>0&&rect.height>0)webchat.show(rect);else webchat.hide()});
    ipcMain.handle('desktop:copy-text', async (event, text) => {
      if(event.sender!==mainWindow?.webContents||typeof text!=='string'||text.length>4_000_000)return false;
      await clipboard.writeText(text);
      return await clipboard.readText()===text;
    });
    ipcMain.handle('desktop:get-workspace', event => event.sender === mainWindow?.webContents ? (app.isPackaged?(process.env.PORTABLE_EXECUTABLE_DIR||app.getPath('documents')):root) : null);
    ipcMain.handle('desktop:save-archive', async (event, bytes, name) => {
      if (!mainWindow || event.sender !== mainWindow.webContents) return null;
      if (!(bytes instanceof Uint8Array) || bytes.byteLength > 64 * 1024 * 1024) throw new Error('导出文件无效或过大。');
      const result = await dialog.showSaveDialog(mainWindow, {
        title: '导出会话日志',
        defaultPath: path.join(app.getPath('downloads'), path.basename(typeof name === 'string' ? name : 'NexusMCP-session.zip')),
        filters: [{ name: 'ZIP 压缩文件', extensions: ['zip'] }],
      });
      if (result.canceled || !result.filePath) return null;
      await fs.promises.writeFile(result.filePath, Buffer.from(bytes));
      return result.filePath;
    });
    ipcMain.handle('desktop:select-workspace', async event => {
      if (!mainWindow || event.sender !== mainWindow.webContents) return null;
      const result = await dialog.showOpenDialog(mainWindow, { title: '选择工作区', properties: ['openDirectory'] });
      return result.canceled ? null : result.filePaths[0] || null;
    });
    ipcMain.handle('desktop:select-attachments', async event => {
      if (!mainWindow || event.sender !== mainWindow.webContents) return [];
      const result = await dialog.showOpenDialog(mainWindow, { title: '添加文件', properties: ['openFile', 'multiSelections'] });
      return result.canceled ? [] : result.filePaths;
    });
    ipcMain.handle('desktop:select-extension', async (event, directory) => {
      if (!mainWindow || event.sender !== mainWindow.webContents) return null;
      const result = await dialog.showOpenDialog(mainWindow, {
        title: directory === true ? '选择插件或技能文件夹' : '选择插件或技能文件',
        properties: [directory === true ? 'openDirectory' : 'openFile'],
      });
      return result.canceled ? null : result.filePaths[0] || null;
    });
    ipcMain.on('desktop:theme', (event, theme) => {
      if (!mainWindow || event.sender !== mainWindow.webContents || !['dark', 'light'].includes(theme)) return;
      mainWindow.setTitleBarOverlay({
        color: theme === 'light' ? '#f1f1f1' : '#1b1b1c',
        symbolColor: theme === 'light' ? '#222222' : '#ededed',
        height: 40,
      });
      mainWindow.setBackgroundColor(theme === 'light' ? '#f1f1f1' : '#1b1b1c');
    });
    if (development) {
      // Vite 与桌面主进程共用生命周期，关闭软件即释放开发端口。
      const { createServer } = await import('vite');
      devServer = await createServer({
        root: path.join(root, 'frontend'),
        configFile: path.join(root, 'frontend', 'vite.config.ts'),
        server: { host: '127.0.0.1', port: 0, strictPort: false, open: false,proxy:{'/api':{target:runtimeUrl,changeOrigin:true,headers:{origin:runtimeUrl}},'/ws':{target:runtimeUrl.replace('http:','ws:'),ws:true,changeOrigin:true,headers:{origin:runtimeUrl}}} },
      });
      await devServer.listen();
      rendererOrigin = devServer.resolvedUrls.local[0].replace(/\/$/, '');
      runtimeProcess.send({type:'runtime.allow-origin',origin:rendererOrigin});
      logStartup('vite:ready',{url:rendererOrigin});
      // API 由 Vite 同源代理，WS 仍经该代理连接。
    } else {
      if (!fs.existsSync(path.join(root, 'frontend', 'dist', 'index.html'))) {
        throw new Error('尚未构建桌面界面。请先执行 npm run build，或使用一键启动开发版.bat。');
      }
      registerAppProtocol();
    }
    await createWindow();
    app.on('activate', () => {
      if (!mainWindow) void createWindow().catch(failStartup);
    });
  }).catch(failStartup);
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', event => {
    if (closingServer) return;
    event.preventDefault();
    closingServer = true;
    void (async()=>{await webchat?.dispose();if(runtimeProcess?.connected){await new Promise(resolve=>{const timer=setTimeout(()=>{if(process.platform==='win32'){const killer=spawn('taskkill.exe',['/PID',String(runtimeProcess.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.once('error',()=>runtimeProcess.kill('SIGKILL'))}else runtimeProcess.kill('SIGKILL');resolve()},7000);runtimeProcess.once('exit',()=>{clearTimeout(timer);resolve()});runtimeProcess.send({type:'shutdown'})})}await devServer?.close()})().catch(console.error).finally(()=>app.quit());
  });
}

function failStartup(error) {
  console.error(error);
  dialog.showErrorBox('NexusMCP Studio 启动失败', error.message);
  app.quit();
}
