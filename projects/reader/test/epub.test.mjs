import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {makeBook} from '../core/parser.mjs';
import {epubFixture} from '../fixtures/epub-fixture.mjs';
import {Library} from '../core/library.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
test('EPUB3按spine顺序读取真实目录，不执行或保留脚本正文',()=>{
 const book=makeBook('文件名.epub',epubFixture());assert.equal(book.title,'城中散步');assert.equal(book.format,'EPUB');
 assert.deepEqual(book.chapters.map(c=>c.title),['清晨的小路','午后的书店','傍晚的归途']);
 assert.ok(book.chapters[0].text.includes('清晨沿着小路'));assert.ok(!book.chapters[0].text.includes('untrustedScriptRan'));
 assert.equal(book.totalChars,book.chapters.reduce((n,c)=>n+c.text.length,0));
 assert.equal(book.chapters[2].start,book.chapters[0].text.length+book.chapters[1].text.length);
});
test('EPUB2的NCX目录与同一文件中多个章节锚点',()=>{
 for(const options of [{epub2:true},{fragmented:true},{fragmented:true,epub2:true}]){
  const book=makeBook('书.epub',epubFixture(options));assert.equal(book.chapters.length,3);assert.equal(book.chapters[1].title,'午后的书店');assert.ok(book.chapters[1].text.includes('午后经过'));assert.ok(!book.chapters[1].text.includes('傍晚回家'));
 }
});
test('坏ZIP、加密、远程目录和压缩包路径越界均明确拒绝',()=>{
 assert.throws(()=>makeBook('x.epub',Buffer.from('wrong')),/解压|EPUB/);
 assert.throws(()=>makeBook('x.epub',epubFixture({encrypted:true})),/加密/);
 assert.throws(()=>makeBook('x.epub',epubFixture({external:true})),/非本地/);
 assert.throws(()=>makeBook('x.epub',zipSync({'../outside.txt':strToU8('bad')})),/路径/);
 const many={};for(let i=0;i<501;i++)many['file'+i]=new Uint8Array(0);
 assert.throws(()=>makeBook('x.epub',zipSync(many)),/超出/);
});
test('TXT标题识别保留无标题正文入口，所有字符有阅读顺序',()=>{
 const a=makeBook('a.txt',Buffer.from('前言文字\n\n第一章 出发\n正文一。\n\n第二章 归途\n正文二。'));
 assert.deepEqual(a.chapters.map(c=>c.title),['前言','第一章 出发','第二章 归途']);
 assert.equal(makeBook('b.txt',Buffer.from('没有章节的短文。')).chapters[0].title,'正文');
});
test('EPUB跳章位置持久化，重建实例后仍指向同一章节',async t=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'shiye-epub-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));
 const lib=await new Library(folder).init();const {book}=await lib.import('书.epub',epubFixture());const full=await lib.read(book.id);
 await lib.progress(book.id,full.chapters[2].start);const reopened=await new Library(folder).init();const restored=await reopened.read(book.id);
 assert.equal(restored.position,restored.chapters[2].start);assert.equal(restored.chapters[2].title,'傍晚的归途');
});
