export function pagesOf(text,size=20){
  const budget=Math.max(350,Math.round(1050-(size-16)*55));
  const pages=[];let start=0;
  while(start<text.length){
    let end=Math.min(text.length,start+budget);
    if(end<text.length){
      const line=text.lastIndexOf('\n',end);
      if(line>start+budget*.6)end=line+1;
      else{const m=text.slice(start+Math.floor(budget*.6),end).match(/[。！？.!?][^。！？.!?]*$/);if(m)end=start+Math.floor(budget*.6)+m.index+1;}
    }
    if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1]))end--;
    pages.push({start,end,text:text.slice(start,end)});start=end;
  }
  return pages.length?pages:[{start:0,end:0,text:''}];
}
export function pageAt(pages,position){return Math.max(0,pages.findIndex((p,i)=>position<p.end||i===pages.length-1));}
export function percent(book){return Math.min(100,Math.floor(100*book.position/book.totalChars));}
