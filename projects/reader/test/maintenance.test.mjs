import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Library} from '../core/library.mjs';
import {createReaderApi} from '../src/api.mjs';
import {zipSync,unzipSync,strToU8,strFromU8} from 'fflate';
import {epubFixture} from '../fixtures/epub-fixture.mjs';
import {makeBook} from '../core/parser.mjs';

async function fixture(t){
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'shiye-maintenance-'));
  t.after(()=>fs.rm(folder,{recursive:true,force:true}));
  return {folder,library:await new Library(folder).init()};
}

test('legacy library gains preferences without losing books or reading position',async t=>{
  const {folder,library}=await fixture(t);
  const {book}=await library.import('旧书.txt',Buffer.from('旧正文'.repeat(100)));
  const file=path.join(folder,'library.json');
  const legacy=JSON.parse(await fs.readFile(file,'utf8'));delete legacy.preferences;
  await fs.writeFile(file,JSON.stringify(legacy));
  const migrated=await new Library(folder).init();
  assert.deepEqual(migrated.preferences(),{fontSize:20});
  await Promise.all([migrated.updatePreferences({fontSize:24}),migrated.progress(book.id,33)]);
  const reopened=await new Library(folder).init();
  assert.equal(reopened.preferences().fontSize,24);
  assert.equal((await reopened.read(book.id)).position,33);
  const before=await fs.readFile(file,'utf8');
  for(const value of [{fontSize:21},{fontSize:30},{fontSize:NaN},{fontSize:20,other:1},null]){
    await assert.rejects(reopened.updatePreferences(value),/字号/);
  }
  assert.equal(await fs.readFile(file,'utf8'),before);
});

test('corrupted chapter cache is rejected without deleting it or affecting other books',async t=>{
  const {folder,library}=await fixture(t);
  const {book}=await library.import('多章.txt',Buffer.from('第一章 早晨\n你好。\n第二章 午后\n再见。'));
  const other=await library.import('其他.txt',Buffer.from('另一段正文'));
  const file=path.join(folder,'books',book.id+'.json');
  const original=JSON.parse(await fs.readFile(file,'utf8'));
  for(const change of [b=>{b.chapters[0].start=5;},b=>{b.totalChars++;},b=>{b.chapters[1].id=b.chapters[0].id;},b=>{b.chapters[0].text='';}]){
    const broken=structuredClone(original);change(broken);
    const bytes=JSON.stringify(broken);await fs.writeFile(file,bytes);
    await assert.rejects(library.read(book.id),/异常|不一致/);
    assert.equal(await fs.readFile(file,'utf8'),bytes);
    assert.equal((await library.read(other.book.id)).title,'其他');
  }
});

test('invalid metadata cannot override chapters or silently reset the library',async t=>{
  const {folder,library}=await fixture(t);
  await library.import('书.txt',Buffer.from('书的正文'));
  const file=path.join(folder,'library.json');
  const state=JSON.parse(await fs.readFile(file,'utf8'));
  state.books[0].chapters=[];const broken=JSON.stringify(state);
  await fs.writeFile(file,broken);
  await assert.rejects(new Library(folder).init(),/原文件已保留/);
  assert.equal(await fs.readFile(file,'utf8'),broken);
});

test('preview calls time out clearly, and server errors keep their explanation',async()=>{
  const pending=(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true}));
  const api=createReaderApi({fetchImpl:pending,timeoutMs:5});
  await assert.rejects(api.list(),/连接超时/);
  const denied=createReaderApi({fetchImpl:async()=>({ok:false,json:async()=>({ok:false,error:'数据文件无法读取'})})});
  await assert.rejects(denied.read('id'),/数据文件无法读取/);
});

test('desktop adapter exposes only named operations and handles old bridge versions',async()=>{
  const api=createReaderApi({bridge:{rawInvoke:()=>{},list:async()=>({ok:true,data:['book']})}});
  assert.equal(api.rawInvoke,undefined);
  assert.deepEqual(await api.list(),['book']);
  await assert.rejects(api.readPreferences(),/版本不一致/);
});

test('long EPUB fallback headings remain readable in new imports and v0.2 caches',async t=>{
  const files=unzipSync(epubFixture());
  const heading='保留完整正文的长章节标题'.repeat(30);
  files['OEBPS/content.opf']=strToU8(strFromU8(files['OEBPS/content.opf'])
    .replace(/<item id="(?:nav|ncx)"[^>]*\/>/g,'').replace(' toc="ncx"',''));
  files['OEBPS/chapter0.xhtml']=strToU8(strFromU8(files['OEBPS/chapter0.xhtml'])
    .replace('<h1>清晨的小路</h1>','<h1>'+heading+'</h1>'));
  const bytes=zipSync(files);
  const parsed=makeBook('长标题.epub',bytes);
  assert.equal(parsed.chapters[0].title,heading.slice(0,160));
  assert.ok(parsed.chapters[0].text.includes(heading));
  const {folder,library}=await fixture(t);
  const {book}=await library.import('长标题.epub',bytes);
  await library.progress(book.id,parsed.chapters[1].start);
  const file=path.join(folder,'books',book.id+'.json');
  const legacy=JSON.parse(await fs.readFile(file,'utf8'));
  legacy.chapters[0].title=heading; // v0.2 persisted untrimmed fallback headings.
  const saved=JSON.stringify(legacy);await fs.writeFile(file,saved);
  const restored=await (await new Library(folder).init()).read(book.id);
  assert.equal(restored.chapters[0].title,heading.slice(0,160));
  assert.equal(restored.position,parsed.chapters[1].start);
  assert.equal(restored.chapters[0].text,parsed.chapters[0].text);
  assert.equal(await fs.readFile(file,'utf8'),saved);
});
