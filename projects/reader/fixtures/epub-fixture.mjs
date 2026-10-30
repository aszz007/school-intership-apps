import {zipSync,strToU8} from 'fflate';
export function epubFixture({epub2=false,fragmented=false,encrypted=false,external=false}={}){
 const chapters=[
  ['清晨的小路','清晨沿着小路散步，街边的树影还很清楚。走到转角时，停下来读几页书，给一天留一点安静的开始。'],
  ['午后的书店','午后经过一家书店，门口的小桌上放着几本翻开的书。没有急着挑选，只是慢慢读过目录，记下想再次回来的理由。'],
  ['傍晚的归途','傍晚回家的路上，城市逐渐安静。把今天见到的细节写进笔记，合上书，再打开时仍能从上次的位置继续。']
 ];
 const html=i=>`<section id="s${i}"><h1>${chapters[i][0]}</h1><p>本书正文由本项目自行编写，用于合法的格式与阅读功能测试。</p>${('<p>'+chapters[i][1]+'</p>').repeat(26)}${i===0?'<script>window.untrustedScriptRan=true</script>':''}</section>`;
 const data={mimetype:strToU8('application/epub+zip'),'META-INF/container.xml':strToU8('<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')};
 const file=i=>fragmented?'all.xhtml':'chapter'+i+'.xhtml';
 const href=i=>file(i)+(fragmented?'#s'+i:'');
 const list=chapters.map((c,i)=>`<li><a href="${external&&i===0?'https://example.com/remote':href(i)}">${c[0]}</a></li>`).join('');
 data['OEBPS/nav.xhtml']=strToU8(`<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>目录</title></head><body><nav epub:type="toc"><ol>${list}</ol></nav></body></html>`);
 data['OEBPS/toc.ncx']=strToU8(`<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap>${chapters.map((c,i)=>`<navPoint id="p${i}"><navLabel><text>${c[0]}</text></navLabel><content src="${href(i)}"/></navPoint>`).join('')}</navMap></ncx>`);
 const contentCount=fragmented?1:3;
 const ids=Array.from({length:contentCount},(_,i)=>'c'+i);
 data['OEBPS/content.opf']=strToU8(`<?xml version="1.0"?><package version="${epub2?'2.0':'3.0'}" unique-identifier="book-id" xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">shiye-test</dc:identifier><dc:title>城中散步</dc:title><dc:language>zh-CN</dc:language></metadata><manifest>${ids.map((id,i)=>`<item id="${id}" href="${file(i)}" media-type="application/xhtml+xml"/>`).join('')}<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" ${epub2?'':'properties="nav"'}/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest><spine toc="ncx">${ids.map(id=>`<itemref idref="${id}"/>`).join('')}</spine></package>`);
 for(let i=0;i<contentCount;i++)data['OEBPS/'+file(i)]=strToU8(`<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${fragmented?'城中散步':chapters[i][0]}</title></head><body>${fragmented?chapters.map((_,j)=>html(j)).join(''):html(i)}</body></html>`);
 if(encrypted)data['META-INF/encryption.xml']=strToU8('<encryption/>');
 return zipSync(data,{level:0});
}
