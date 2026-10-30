import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Library} from '../core/library.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const library=await new Library(path.join(root,'.local','preview-library')).init();
const origin='http://127.0.0.1:4245';
const json=(r,status,data)=>{r.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});r.end(JSON.stringify(data));};
async function body(req,limit){const chunks=[];let size=0;for await(const part of req){size+=part.length;if(size>limit)throw Error('请求内容过大。');chunks.push(part);}return Buffer.concat(chunks);}
http.createServer(async(req,res)=>{try{
  if(req.headers.host!=='127.0.0.1:4245')return json(res,403,{ok:false,error:'不允许的来源。'});
  const url=new URL(req.url,origin);if(url.pathname.startsWith('/api/')){
    if(req.method!=='GET'&&req.headers.origin!==origin)return json(res,403,{ok:false,error:'不允许的写入来源。'});
    let data;
    if(req.method==='GET'&&url.pathname==='/api/books')data=library.list();
    else if(req.method==='GET'&&url.pathname==='/api/preferences')data=library.preferences();
    else if(req.method==='POST'&&url.pathname==='/api/preferences')data=await library.updatePreferences(JSON.parse((await body(req,1024)).toString()));
    else if(req.method==='GET'&&url.pathname==='/api/book')data=await library.read(url.searchParams.get('id'));
    else if(req.method==='POST'&&url.pathname==='/api/import')data=await library.import(url.searchParams.get('name')||'',await body(req,20*1024*1024));
    else if(req.method==='POST'&&['/api/progress','/api/remove'].includes(url.pathname)){
      const input=JSON.parse((await body(req,1024)).toString());data=url.pathname==='/api/progress'?await library.progress(input.id,input.position):await library.remove(input.id);
    }else return json(res,404,{ok:false,error:'没有这个操作。'});
    return json(res,200,{ok:true,data});
  }
  let rel=decodeURIComponent(url.pathname).replace(/^\//,'');if(!rel)rel='index.html';
  if(!(rel==='index.html'||/^assets\/[a-zA-Z0-9_.-]+\.(js|css)$/.test(rel)))return json(res,404,{ok:false,error:'文件不存在。'});
  const data=await fs.readFile(path.join(root,'dist',rel));res.writeHead(200,{'Content-Type':rel.endsWith('.js')?'text/javascript':rel.endsWith('.css')?'text/css':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(data);
}catch(e){json(res,400,{ok:false,error:e.message});}}).listen(4245,'127.0.0.1',()=>console.log('仅供隔离测试的React预览：'+origin));
