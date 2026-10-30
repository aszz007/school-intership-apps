import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {epubFixture} from '../fixtures/epub-fixture.mjs';
const folder=new URL('../fixtures/',import.meta.url);await fs.mkdir(folder,{recursive:true});
await fs.writeFile(new URL('城中散步.epub',folder),epubFixture());
await fs.writeFile(new URL('旧格式目录测试.epub',folder),epubFixture({epub2:true}));
await fs.writeFile(new URL('同文件多章节测试.epub',folder),epubFixture({fragmented:true}));
console.log('自编EPUB测试文件：'+fileURLToPath(folder));
