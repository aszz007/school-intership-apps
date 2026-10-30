import { createHash } from 'node:crypto';
import path from 'node:path';
import {readEpub} from './epub.mjs';
export const MAX_BYTES=20*1024*1024;
export const MAX_CHARS=5_000_000;
export const APP_VERSION='0.3.0';
export function decodeText(bytes){
  if(!bytes.length)throw Error('文件为空，请选择有正文的书籍。');
  if(bytes.length>MAX_BYTES)throw Error('单本书籍不能超过20MB。');
  let text;
  try{
    if(bytes[0]===255&&bytes[1]===254)text=new TextDecoder('utf-16le',{fatal:true}).decode(bytes);
    else if(bytes[0]===254&&bytes[1]===255)text=new TextDecoder('utf-16be',{fatal:true}).decode(bytes);
    else try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('gb18030',{fatal:true}).decode(bytes);}
  }catch{throw Error('无法识别文本编码，请另存为UTF-8后导入。');}
  if(text.includes('\0')||(text.match(/[\x01-\x08\x0B\x0E-\x1F]/g)||[]).length>text.length/100)throw Error('文件包含非文本内容，请选择有效TXT文件。');
  text=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();
  if(!text)throw Error('没有可阅读的正文。');
  if(text.length>MAX_CHARS)throw Error('书籍正文过长，请选择较小的文件。');
  return text;
}
export function makeBook(filename,bytes){
  const ext=path.extname(filename).toLowerCase();
  if(!['.txt','.epub'].includes(ext))throw Error('请选择TXT或EPUB文件。');
  if(!bytes.length||bytes.length>MAX_BYTES)throw Error('文件为空或超过20MB。');
  const base={id:createHash('sha256').update(bytes).digest('hex'),title:path.basename(filename,path.extname(filename)).slice(0,160)||'未命名书籍',format:ext==='.epub'?'EPUB':'TXT'};
  if(ext==='.epub'){const parsed=readEpub(bytes);return {...base,...parsed,title:parsed.title||base.title};}
  const text=decodeText(bytes),headings=[...text.matchAll(/^\s*(第[零〇一二三四五六七八九十百千万两\d]{1,12}[章回节卷部篇][^\n]{0,70})\s*$/gm)];
  if(headings.length>1000)throw Error('TXT章节数量超出限制。');
  const cuts=headings.map(m=>({at:m.index,title:m[1].trim()}));
  if(!cuts.length||cuts[0].at>0)cuts.unshift({at:0,title:cuts.length?'前言':'正文'});
  let position=0;const chapters=[];
  for(let i=0;i<cuts.length;i++){const part=text.slice(cuts[i].at,cuts[i+1]?.at??text.length).trim();if(part){chapters.push({id:'chapter-'+chapters.length,title:cuts[i].title,text:part,start:position});position+=part.length;}}
  return {...base,chapters,totalChars:position};
}
