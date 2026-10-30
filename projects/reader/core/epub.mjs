import path from 'node:path';
import {unzipSync} from 'fflate';
import {DOMParser} from '@xmldom/xmldom';
const tags=(node,name)=>Array.from(node.getElementsByTagName('*')).filter(e=>e.localName===name);
function parseXML(bytes,html=false){
 let text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 if(/<!ENTITY/i.test(text)||/<!DOCTYPE[^>]*\[/i.test(text))throw Error('不支持含自定义实体的书籍。');
 text=text.replace(/<!DOCTYPE[^>]*>/gi,'');
 return new DOMParser({onError:(level)=>{if(level==='error'||level==='fatalError')throw Error('EPUB内部文档格式错误。');}}).parseFromString(text,html?'text/html':'application/xml');
}
function hrefOf(base,href){
 if(!href||/^[a-z][a-z0-9+.-]*:|^\/\//i.test(href))throw Error('EPUB包含非本地章节地址。');
 const [part,frag='']=href.split('#');let decoded;
 try{decoded=decodeURIComponent(part.split('?')[0]);}catch{throw Error('EPUB文件路径编码无效。');}
 if(decoded.includes('\\')||decoded.includes('\0')||decoded.startsWith('/')||/^[A-Za-z]:/.test(decoded))throw Error('EPUB文件路径无效。');
 const full=part?path.posix.normalize(path.posix.join(path.posix.dirname(base),decoded)):base;
 if(full==='..'||full.startsWith('../'))throw Error('EPUB路径超出书籍范围。');
 let fragment;try{fragment=decodeURIComponent(frag);}catch{throw Error('EPUB章节锚点编码无效。');}
 return {file:full,fragment};
}
function textOf(doc){
 const body=tags(doc,'body')[0]||doc.documentElement;let text='';const anchors=new Map();
 const omitted=new Set(['script','style','iframe','object','embed','svg','math','head','nav','noscript']);
 const blocks=new Set(['p','div','section','article','h1','h2','h3','h4','li','blockquote','pre']);
 const newline=()=>{if(text&&!text.endsWith('\n'))text+='\n';};
 function walk(node){
  if(node.nodeType===3||node.nodeType===4){text+=node.data.replace(/[\t\r\n ]+/g,' ');return;}
  if(node.nodeType!==1)return;const tag=node.localName?.toLowerCase();if(omitted.has(tag))return;
  if(blocks.has(tag))newline();const id=node.getAttribute('id');if(id)anchors.set(id,text.length);
  if(tag==='br')newline();for(const child of Array.from(node.childNodes))walk(child);if(blocks.has(tag))newline();
 }
 walk(body);const leading=text.length-text.trimStart().length;text=text.trim();
 for(const [id,position] of anchors)anchors.set(id,Math.max(0,position-leading));
 return {text,anchors,title:tags(doc,'h1')[0]?.textContent.trim()||tags(doc,'title')[0]?.textContent.trim()||''};
}
export function readEpub(bytes){
 let total=0,count=0,entries;
 try{entries=unzipSync(bytes,{filter:file=>{
   count++;const name=file.name;
   if(count>500||!Number.isSafeInteger(file.originalSize)||file.originalSize>8*1024*1024||(total+=file.originalSize)>50*1024*1024)throw Error('EPUB解压内容超出限制。');
   if(name.includes('\\')||name.includes('\0')||name.startsWith('/')||/^[A-Za-z]:/.test(name)||path.posix.normalize(name).startsWith('../'))throw Error('EPUB压缩包路径无效。');
   return !name.endsWith('/');
 }});}catch(e){if(e.message.startsWith('EPUB'))throw e;throw Error('无法解压EPUB，请确认文件完整。');}
 const zip={};for(const [name,data] of Object.entries(entries)){const normalized=path.posix.normalize(name);if(zip[normalized])throw Error('EPUB包含重复路径。');zip[normalized]=data;}
 const get=name=>{if(!zip[name])throw Error('EPUB缺少文件：'+name);return zip[name];};
 if(new TextDecoder().decode(get('mimetype')).trim()!=='application/epub+zip')throw Error('这不是有效的EPUB文件。');
 if(zip['META-INF/encryption.xml'])throw Error('当前版本不支持含加密资源的EPUB，请使用未加密的合法书籍。');
 const container=parseXML(get('META-INF/container.xml'));const opfName=tags(container,'rootfile')[0]?.getAttribute('full-path');
 if(!opfName)throw Error('EPUB缺少书籍索引。');const opfPath=hrefOf('root',opfName).file;
 const opf=parseXML(get(opfPath)),items=new Map();
 for(const item of tags(opf,'item')){const id=item.getAttribute('id');if(!id||items.has(id))throw Error('EPUB目录索引重复或缺失。');items.set(id,{...hrefOf(opfPath,item.getAttribute('href')),media:item.getAttribute('media-type'),properties:item.getAttribute('properties')||''});}
 const spine=tags(opf,'spine')[0];if(!spine)throw Error('EPUB没有阅读顺序。');
 const order=tags(spine,'itemref').filter(n=>n.getAttribute('linear')!=='no').map(n=>items.get(n.getAttribute('idref')));
 if(!order.length||order.some(i=>!i||!['application/xhtml+xml','text/html'].includes(i.media)))throw Error('EPUB章节索引不完整或格式暂不支持。');
 const toc=[];const nav=[...items.values()].find(i=>i.properties.split(/\s+/).includes('nav'));
 if(nav){const doc=parseXML(get(nav.file),true);const tocNav=tags(doc,'nav').find(n=>(n.getAttribute('epub:type')||'').split(/\s+/).includes('toc')||n.getAttribute('role')==='doc-toc');if(tocNav)for(const a of tags(tocNav,'a')){const label=a.textContent.trim();if(label)toc.push({...hrefOf(nav.file,a.getAttribute('href')),label:label.slice(0,160)});}}
 const ncx=items.get(spine.getAttribute('toc'))||[...items.values()].find(i=>i.media==='application/x-dtbncx+xml');
 if(!toc.length&&ncx){const doc=parseXML(get(ncx.file));for(const point of tags(doc,'navPoint')){const source=tags(point,'content')[0]?.getAttribute('src'),label=tags(point,'navLabel')[0]?.textContent.trim();if(source&&label)toc.push({...hrefOf(ncx.file,source),label:label.slice(0,160)});}}
 let position=0;const chapters=[];
 for(const item of order){
  const body=textOf(parseXML(get(item.file),true));if(!body.text)continue;
  const cuts=new Map([[0,body.title.slice(0,160)||'第'+(chapters.length+1)+'节']]);
  for(const link of toc.filter(t=>t.file===item.file)){if(link.fragment&&!body.anchors.has(link.fragment))continue;const offset=link.fragment?body.anchors.get(link.fragment):0;if(offset<body.text.length)cuts.set(offset,link.label);}
  const boundaries=[...cuts].sort((a,b)=>a[0]-b[0]);
  for(let i=0;i<boundaries.length;i++){const [from,title]=boundaries[i];const text=body.text.slice(from,boundaries[i+1]?.[0]??body.text.length).trim();if(!text)continue;chapters.push({id:'chapter-'+chapters.length,title,text,start:position});position+=text.length;}
 }
 if(!chapters.length)throw Error('没有找到可阅读的文字，本版本不支持纯图片书籍。');
 if(chapters.length>1000||position>5_000_000)throw Error('EPUB正文或章节数量超出限制。');
 const title=tags(opf,'title')[0]?.textContent.trim().slice(0,160)||'';
 return {title,chapters,totalChars:position};
}
