import React,{useEffect,useMemo,useRef,useState} from 'react';
import {pagesOf,pageAt,percent} from './reading.mjs';
import {createReaderApi} from './api.mjs';
import {version as appVersion} from '../package.json';
const desktop=Boolean(window.reader);
const api=createReaderApi({bridge:window.reader});
function Mark(){return <svg width="29" height="29" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M16 8C10 4 5 5 3 6v21c5-2 9-1 13 2 4-3 8-4 13-2V6c-5-2-9-1-13 2Z" stroke="currentColor" strokeWidth="1.8"/><path d="M16 8v21M7 11l5 1M20 12l5-1" stroke="currentColor" strokeWidth="1.6"/></svg>;}
export default function App(){
 const [books,setBooks]=useState([]),[book,setBook]=useState(null),[query,setQuery]=useState(''),[format,setFormat]=useState('全部');
 const [font,setFont]=useState(20),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[ready,setReady]=useState(false),[loadError,setLoadError]=useState(false),[pendingRemove,setPendingRemove]=useState(null);
 const files=useRef(null),heading=useRef(null),readArea=useRef(null),dialog=useRef(null),importButton=useRef(null);
 async function loadBooks(active=()=>true){
  if(active()){setReady(false);setLoadError(false);setError('');}
  try{const [list,preferences]=await Promise.all([api.list(),api.readPreferences()]);if(active()){setBooks(list);setFont(preferences.fontSize);}}
  catch(e){if(active()){setLoadError(true);setError(e.message);}}
  finally{if(active())setReady(true);}
 }
 useEffect(()=>{let active=true;loadBooks(()=>active);return()=>{active=false;};},[]);
 useEffect(()=>{
  if(!pendingRemove||!dialog.current)return;
  const previous=document.activeElement;
  dialog.current.querySelector('button:not(:disabled)')?.focus();
  const keydown=e=>{
   if(e.key==='Escape'){e.preventDefault();if(dialog.current?.getAttribute('aria-busy')!=='true')setPendingRemove(null);}
   if(e.key==='Tab'){
    const controls=[...dialog.current.querySelectorAll('button:not(:disabled)')];
    if(!controls.length){e.preventDefault();dialog.current.focus();return;}
    const first=controls[0],last=controls.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
   }
  };
  document.addEventListener('keydown',keydown,true);
  return()=>{document.removeEventListener('keydown',keydown,true);(previous?.isConnected?previous:importButton.current)?.focus();};
 },[pendingRemove]);
 const visible=books.filter(b=>(format==='全部'||b.format===format)&&b.title.toLowerCase().includes(query.trim().toLowerCase()));
 const chapter=book?book.chapters.reduce((selected,c)=>c.start<=Math.min(book.position,book.totalChars-1)?c:selected,book.chapters[0]):null;
 const chapterIndex=book?book.chapters.indexOf(chapter):0;
 const pages=useMemo(()=>pagesOf(chapter?.text||'',font),[chapter?.text,font]);
 const pageIndex=book?pageAt(pages,Math.max(0,book.position-chapter.start)):0;
 const page=pages[pageIndex];
 const end=Boolean(book&&chapterIndex===book.chapters.length-1&&pageIndex===pages.length-1);
 async function run(task){if(busy)return;setBusy(true);setError('');setMessage('');try{await task();}catch(e){setError(e.message);}finally{setBusy(false);}}
 function report(result){setBooks(result.books);setMessage(`已导入${result.imported}本${result.duplicates?'，'+result.duplicates+'本已在书架':''}`);if(result.errors.length)setError(result.errors.join('\n'));}
 async function importBooks(){if(!ready||busy||loadError)return;if(desktop)await run(async()=>report(await api.open()));else files.current.click();}
 async function importWeb(event){const chosen=[...event.target.files];event.target.value='';await run(async()=>{let imported=0,duplicates=0;const errors=[];if(chosen.length>20)throw Error('一次最多导入20本。');for(const f of chosen){try{if(f.size>20*1024*1024)throw Error('文件超过20MB。');const r=await api.importFile(f);r.duplicate?duplicates++:imported++;}catch(e){errors.push(f.name+'：'+e.message);}}report({imported,duplicates,errors,books:await api.list()});});}
 async function open(id){await run(async()=>{setBook(await api.read(id));setPendingRemove(null);});requestAnimationFrame(()=>heading.current?.focus());}
 async function move(position){await run(async()=>{const list=await api.progress(book.id,position);setBooks(list);setBook(b=>({...b,position}));setMessage('阅读位置已保存');});readArea.current?.scrollTo(0,0);}
 async function leave(){if(busy)return;setBook(null);setMessage('阅读位置已保存');setError('');}
 async function remove(id){await run(async()=>{setBooks(await api.remove(id));setPendingRemove(null);});}
 async function changeFont(size){await run(async()=>{const preferences=await api.updatePreferences({fontSize:size});setFont(preferences.fontSize);setMessage('字号已保存');});}
 function next(){if(pageIndex<pages.length-1)move(chapter.start+pages[pageIndex+1].start);else if(chapterIndex<book.chapters.length-1)move(book.chapters[chapterIndex+1].start);else move(book.totalChars);}
 function prev(){if(pageIndex>0)move(chapter.start+pages[pageIndex-1].start);else if(chapterIndex>0){const previous=book.chapters[chapterIndex-1];const pp=pagesOf(previous.text,font);move(previous.start+pp.at(-1).start);}}
 useEffect(()=>{const handler=e=>{if(!book||busy||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||e.ctrlKey||e.altKey||e.metaKey)return;if(e.key==='ArrowRight'){e.preventDefault();next();}if(e.key==='ArrowLeft'){e.preventDefault();prev();}if(e.key==='Escape')leave();};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[book,busy,pages,pageIndex,chapterIndex]);
 return <div className={'app '+(book?'reading':'')}>
 {!desktop&&<div className="preview">拾页 · 网页预览</div>}
 <input ref={files} type="file" hidden multiple accept=".txt,.epub" onChange={importWeb} aria-label="选择书籍文件"/>
 {!book?<>
 <aside className="sidebar"><div className="brand"><Mark/><span>拾页</span></div><p className="brand-note">离线阅读器</p><button className="nav-selected" onClick={()=>{setFormat('全部');setQuery('');}}>我的书架 <span>{books.length}</span></button><details className="shelf-note"><summary>书库说明</summary><p>书籍和阅读位置保存在这台电脑。移除书籍只删除应用副本，原文件保留。</p></details><div className="version">拾页阅读器 {appVersion}</div></aside>
 <main className="library"><header className="library-header"><div><h1>我的书架</h1></div><button ref={importButton} className="primary" onClick={importBooks} disabled={busy||!ready||loadError}>导入书籍</button></header>
 <div className="filters"><div className="formats" aria-label="书籍格式">{['全部','TXT','EPUB'].map(f=><button key={f} aria-pressed={format===f} onClick={()=>setFormat(f)}>{f}</button>)}</div><label className="search"><span>搜索书名</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="输入书名"/></label></div>
 <div className="feedback" aria-live="polite">{busy?'正在处理…':message}</div>{error&&<div role="alert" className="error">{error}</div>}
 {!ready?<p className="empty">正在打开书库…</p>:loadError?<div className="empty"><Mark/><h2>书库暂时无法打开</h2><p>检查上方提示后重试，现有书库不会被清空。</p><button className="secondary" onClick={()=>loadBooks()}>重试打开</button></div>:visible.length===0?<div className="empty"><Mark/><h2>{books.length?'没有找到这本书':'暂无书籍'}</h2><p>{books.length?'试试其他书名，或切换到全部格式。':'点击“导入书籍”，选择本地TXT或EPUB文件。'}</p><button className="secondary" disabled={busy} onClick={books.length?()=>{setQuery('');setFormat('全部');}:importBooks}>{books.length?'重置筛选':'选择本地书籍'}</button></div>:<div className="book-grid">{visible.map(b=><article className="book" key={b.id}><button className={'cover tone-'+(parseInt(b.id[0],16)%4)} onClick={()=>open(b.id)} disabled={busy} aria-label={'打开 '+b.title}><span className="cover-format">{b.format}</span><span className="cover-title">{b.title}</span><span className="cover-rule"/><span className="cover-bottom">拾页藏书</span></button><div className="book-description"><h2>{b.title}</h2><div className="book-detail"><span>{percent(b)===100?'已读完':b.position?'读到 '+percent(b)+'%':'尚未开始'}</span><button className="remove" onClick={()=>desktop?remove(b.id):setPendingRemove(b.id)} disabled={busy} aria-label={'移除 '+b.title}>移除</button></div><progress value={percent(b)} max="100" aria-label={b.title+'阅读进度'}/></div></article>)}</div>}
 <footer className="library-footer"><span>支持TXT、EPUB · 单本不超过20MB</span><span>导入时保留原文件</span></footer>
 </main></>:<>
 <header className="reader-toolbar"><button className="back" onClick={leave} disabled={busy}>‹ 书架</button><span className="toolbar-title">{book.title}</span><div className="type-controls"><button aria-label="减小字号" disabled={busy||font<=16} onClick={()=>changeFont(font-2)}>A−</button><span>{font}px</span><button aria-label="增大字号" disabled={busy||font>=28} onClick={()=>changeFont(font+2)}>A＋</button></div></header>
 <div className="reader-body">{book.chapters.length>1&&<nav className="toc" aria-label="书籍目录"><h2>目录</h2>{book.chapters.map((c,i)=><button key={c.id} aria-current={i===chapterIndex?'location':undefined} disabled={busy} onClick={()=>move(c.start)}>{c.title}</button>)}</nav>}
 <main className="paper" ref={readArea}><div className="paper-content" style={{fontSize:font}}><p className="chapter-label">{book.format}</p><h1 tabIndex="-1" ref={heading}>{book.chapters.length>1?chapter.title:book.title}</h1><div className="text">{page.text.split('\n').map((line,i)=><p key={page.start+'-'+i}>{line||'\u00a0'}</p>)}</div></div></main></div>
 <footer className="reader-footer"><div className="reader-status"><span>{percent(book)}%</span><span>{chapterIndex+1} / {book.chapters.length}章 · {pageIndex+1} / {pages.length}页</span></div><div className="page-actions"><button disabled={busy||(chapterIndex===0&&pageIndex===0)} onClick={prev}>上一页</button><button className="primary" disabled={busy||(end&&book.position===book.totalChars)} onClick={next}>{end?(book.position===book.totalChars?'已读完':'读完本书'):'下一页'}</button></div><span className="save-status" role={error?'alert':'status'}>{error|| (busy?'正在保存…':message||'阅读位置自动保存')}</span></footer>
 </>}
 {pendingRemove&&<div className="modal-shade"><section ref={dialog} tabIndex="-1" className="modal" role="dialog" aria-modal="true" aria-busy={busy} aria-labelledby="remove-title" aria-describedby="remove-description"><h2 id="remove-title">从书架移除？</h2><p id="remove-description">只移除应用副本和阅读记录，不删除原文件。</p><div><button onClick={()=>setPendingRemove(null)} disabled={busy}>取消</button><button className="primary" onClick={()=>remove(pendingRemove)} disabled={busy}>移除书籍</button></div></section></div>}
 </div>;
}
