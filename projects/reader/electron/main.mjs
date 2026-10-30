import {app,BrowserWindow,dialog,ipcMain,protocol,net,session} from 'electron';
import fs from 'node:fs/promises';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Library} from '../core/library.mjs';
import {MAX_BYTES} from '../core/parser.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
app.setName('拾页阅读器');
protocol.registerSchemesAsPrivileged([{scheme:'app',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
if(process.env.SHIYE_DATA_DIR){
  const isolated=path.resolve(process.env.SHIYE_DATA_DIR);
  mkdirSync(isolated,{recursive:true});
  app.setPath('userData',isolated);
  app.setPath('sessionData',isolated);
}
if(!app.requestSingleInstanceLock())app.quit();
else{
let win;let library;
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});
app.whenReady().then(async()=>{
protocol.handle('app',request=>{
  const url=new URL(request.url);
  if(url.host!=='reader'||request.method!=='GET')return new Response('',{status:403});
  let file;
  try{file=path.resolve(root,'dist','.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));}catch{return new Response('',{status:400});}
  const rel=path.relative(path.join(root,'dist'),file);
  if(rel.startsWith('..')||path.isAbsolute(rel))return new Response('',{status:403});
  return net.fetch(pathToFileURL(file).toString());
});
session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
session.defaultSession.setPermissionCheckHandler(()=>false);
session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_details,callback)=>callback({cancel:true}));
try{library=await new Library(path.join(app.getPath('userData'),'library')).init();}
catch(e){dialog.showErrorBox('书库无法打开',e.message);app.quit();}
if(library){
  const bind=(channel,fn)=>ipcMain.handle(channel,async(event,...args)=>{
    if(event.sender!==win?.webContents||event.senderFrame!==event.sender.mainFrame||event.senderFrame.url!=='app://reader/index.html')return {ok:false,error:'不允许的请求来源。'};
    try{return {ok:true,data:await fn(...args)};}catch(e){console.error(channel,e);return {ok:false,error:e.message||'操作未完成，请重试。'};}
  });
  bind('reader:list',()=>library.list());
  bind('reader:preferences',()=>library.preferences());
  bind('reader:update-preferences',value=>library.updatePreferences(value));
  bind('reader:read',id=>library.read(id));
  bind('reader:progress',(id,pos)=>library.progress(id,pos));
  bind('reader:remove',async id=>{
    const answer=await dialog.showMessageBox(win,{type:'question',buttons:['取消','移除书籍'],defaultId:0,cancelId:0,message:'从书架移除这本书？',detail:'只移除应用内的副本和阅读记录，不会删除原文件。'});
    if(answer.response!==1)return library.list();return library.remove(id);
  });
  bind('reader:import',async()=>{
    const selected=await dialog.showOpenDialog(win,{title:'导入书籍',properties:['openFile','multiSelections'],filters:[{name:'电子书',extensions:['txt','epub']}]});
    const result={imported:0,duplicates:0,errors:[]};
    if(selected.canceled)return {...result,books:library.list()};
    if(selected.filePaths.length>20)throw Error('一次最多导入20本书籍。');
    for(const file of selected.filePaths){try{
      const stat=await fs.stat(file);if(!stat.isFile()||stat.size>MAX_BYTES)throw Error('文件无效或超过20MB。');
      const response=await library.import(path.basename(file),await fs.readFile(file));result[response.duplicate?'duplicates':'imported']++;
    }catch(e){result.errors.push(path.basename(file)+'：'+e.message);}}
    return {...result,books:library.list()};
  });
  win=new BrowserWindow({width:1280,height:840,minWidth:760,minHeight:660,title:'拾页阅读器',icon:path.join(root,'assets','icon.png'),backgroundColor:'#ffffff',webPreferences:{preload:path.join(root,'electron','preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.removeMenu();win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  let quitting=false;
  app.on('before-quit',event=>{if(!quitting){event.preventDefault();library.queue.finally(()=>{quitting=true;app.quit();});}});
  win.webContents.on('will-navigate',(e,url)=>{if(url!=='app://reader/index.html')e.preventDefault();});
  await win.loadURL('app://reader/index.html');
  console.log('Reader window loaded:',app.getVersion());
  app.on('window-all-closed',()=>app.quit());
}
}).catch(error=>{console.error(error);dialog.showErrorBox('阅读器启动失败',error.message);app.quit();});
}
