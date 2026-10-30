import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {makeBook} from './parser.mjs';
import {validMetadata,validateBook,validatePreferences} from './validation.mjs';
const idOK=id=>typeof id==='string'&&/^[a-f0-9]{64}$/.test(id);
async function readJSON(file,limit){
  const stat=await fs.stat(file);
  if(!stat.isFile()||stat.size>limit)throw Error('本地数据文件超出读取限制。');
  return JSON.parse(await fs.readFile(file,'utf8'));
}
export class Library{
  constructor(folder){this.folder=folder;this.state=null;this.queue=Promise.resolve();}
  async init(){
    await fs.mkdir(path.join(this.folder,'books'),{recursive:true});
    try{
      const state=await readJSON(path.join(this.folder,'library.json'),512*1024);
      if(!state||state.version!==1||!Array.isArray(state.books)||state.books.length>100||state.books.some(b=>!validMetadata(b))||new Set(state.books.map(b=>b.id)).size!==state.books.length)throw Error('invalid library');
      this.state={...state,preferences:state.preferences===undefined?{fontSize:20}:validatePreferences(state.preferences)};
    }catch(e){
      if(e.code!=='ENOENT')throw Error('书库数据无法读取，原文件已保留。请先备份数据目录再排查。');
      this.state={version:1,books:[],preferences:{fontSize:20}};
    }
    return this;
  }
  async atomic(file,data){const tmp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(tmp,JSON.stringify(data),'utf8');await fs.rename(tmp,file);}
  serial(fn){const next=this.queue.then(fn);this.queue=next.catch(()=>{});return next;}
  list(){if(!this.state)throw Error('书库尚未就绪。');return structuredClone(this.state.books);}
  async read(id){
    const metadata=this.state.books.find(b=>b.id===id);
    if(!idOK(id)||!metadata)throw Error('书籍不存在，请返回书架重新打开。');
    let book;
    try{book=await readJSON(path.join(this.folder,'books',id+'.json'),64*1024*1024);}catch{throw Error('这本书的数据无法读取，书架和原文件已保留。');}
    validateBook(book,metadata);
    return {...book,chapters:book.chapters.map(chapter=>({...chapter,title:chapter.title.slice(0,160)})),position:metadata.position,addedAt:metadata.addedAt,lastReadAt:metadata.lastReadAt};
  }
  import(filename,bytes){return this.serial(async()=>{
    const book=validateBook(makeBook(filename,bytes));
    if(this.state.books.some(b=>b.id===book.id))return {duplicate:true,book:this.state.books.find(b=>b.id===book.id)};
    if(this.state.books.length>=100)throw Error('书架最多100本，请先移除不再阅读的书籍。');
    const meta={id:book.id,title:book.title,format:book.format,totalChars:book.totalChars,position:0,addedAt:new Date().toISOString(),lastReadAt:null};
    await this.atomic(path.join(this.folder,'books',book.id+'.json'),book);
    const next={...this.state,books:[meta,...this.state.books]};
    await this.atomic(path.join(this.folder,'library.json'),next);this.state=next;
    return {duplicate:false,book:meta};
  });}
  progress(id,position){return this.serial(async()=>{
    const meta=this.state.books.find(b=>b.id===id);
    if(!idOK(id)||!meta||!Number.isSafeInteger(position)||position<0||position>meta.totalChars)throw Error('阅读位置无效。');
    const next={...this.state,books:this.state.books.map(b=>b.id===id?{...b,position,lastReadAt:new Date().toISOString()}:b)};
    await this.atomic(path.join(this.folder,'library.json'),next);this.state=next;return this.list();
  });}
  remove(id){return this.serial(async()=>{
    if(!idOK(id)||!this.state.books.some(b=>b.id===id))throw Error('书籍不存在。');
    const next={...this.state,books:this.state.books.filter(b=>b.id!==id)};
    await this.atomic(path.join(this.folder,'library.json'),next);this.state=next;
    await fs.unlink(path.join(this.folder,'books',id+'.json')).catch(()=>{});
    return this.list();
  });}
  preferences(){return structuredClone(this.state.preferences);}
  updatePreferences(value){return this.serial(async()=>{
    const preferences=validatePreferences(value);
    const next={...this.state,preferences};
    await this.atomic(path.join(this.folder,'library.json'),next);this.state=next;
    return this.preferences();
  });}
}
