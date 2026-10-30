import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Library} from '../core/library.mjs';
import {makeBook,decodeText} from '../core/parser.mjs';
import {pagesOf,pageAt} from '../src/reading.mjs';
async function fixture(t){const folder=await fs.mkdtemp(path.join(os.tmpdir(),'shiye-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));return {folder,lib:await new Library(folder).init()};}
test('中文TXT与编码、空文件和伪装二进制',()=>{
  assert.equal(makeBook('测试.txt',Buffer.from('第一章\r\n你好')).chapters[0].text,'第一章\n你好');
  assert.equal(decodeText(Buffer.from([0xc4,0xe3,0xba,0xc3])),'你好');
  assert.throws(()=>makeBook('x.jpg',Buffer.from('正文')),/TXT/);
  assert.throws(()=>decodeText(Buffer.alloc(0)),/为空/);
  assert.throws(()=>decodeText(Buffer.from('a\0b')),/非文本/);
});
test('重复导入幂等，同名不同内容分开，原文件不参与删除',async t=>{
  const {lib}=await fixture(t);const a=await lib.import('同名.txt',Buffer.from('甲'.repeat(200)));
  assert.equal((await lib.import('另一个名.txt',Buffer.from('甲'.repeat(200)))).duplicate,true);
  await lib.import('同名.txt',Buffer.from('乙'.repeat(200)));assert.equal(lib.list().length,2);
  await lib.remove(a.book.id);assert.equal(lib.list().length,1);
});
test('进度串行保存，关闭重建后恢复，非法位置不改变原数据',async t=>{
  const {folder,lib}=await fixture(t);const {book}=await lib.import('书.txt',Buffer.from('文本'.repeat(3000)));
  await Promise.all([lib.progress(book.id,400),lib.progress(book.id,1200)]);
  const reopened=await new Library(folder).init();assert.equal(reopened.list()[0].position,1200);
  await assert.rejects(reopened.progress(book.id,9000),/无效/);assert.equal(reopened.list()[0].position,1200);
  assert.equal((await reopened.read(book.id)).chapters[0].text.length,6000);
});
test('损坏书库不静默清空',async t=>{
  const {folder}=await fixture(t);const file=path.join(folder,'library.json');await fs.writeFile(file,'not json');
  await assert.rejects(new Library(folder).init(),/原文件已保留/);assert.equal(await fs.readFile(file,'utf8'),'not json');
});
test('分页无缺字，字号变化保持字符位置，完成后落到最后一页',()=>{
  const text=('这是中文段落。还有下一句。\n'+'😀').repeat(200);
  for(const size of [16,20,28]){const pages=pagesOf(text,size);assert.equal(pages.map(p=>p.text).join(''),text);const p=pages[pageAt(pages,1550)];assert.ok(p.start<=1550&&p.end>1550);assert.equal(pageAt(pages,text.length),pages.length-1);}
});
