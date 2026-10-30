const validId=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const metaKeys=new Set(['id','title','format','totalChars','position','addedAt','lastReadAt']);

export function validMetadata(book){
  return Boolean(book&&typeof book==='object'&&!Array.isArray(book)&&
    Object.keys(book).every(key=>metaKeys.has(key))&&validId(book.id)&&text(book.title,160)&&
    ['TXT','EPUB'].includes(book.format)&&Number.isSafeInteger(book.totalChars)&&
    book.totalChars>0&&book.totalChars<=5_000_000&&Number.isSafeInteger(book.position)&&
    book.position>=0&&book.position<=book.totalChars&&date(book.addedAt)&&
    (book.lastReadAt===null||date(book.lastReadAt)));
}

export function validatePreferences(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).length!==1||!Object.hasOwn(value,'fontSize')||
    !Number.isInteger(value.fontSize)||value.fontSize<16||value.fontSize>28||value.fontSize%2!==0){
    throw Error('字号设置无效，请选择16到28之间的偶数字号。');
  }
  return {fontSize:value.fontSize};
}

export function validateBook(book,metadata){
  if(!book||!validId(book.id)||!text(book.title,160)||!['TXT','EPUB'].includes(book.format)||
    !Array.isArray(book.chapters)||book.chapters.length<1||book.chapters.length>1000){
    throw Error('书籍数据格式异常，原文件已保留。');
  }
  let length=0;const ids=new Set();
  for(const chapter of book.chapters){
    // v0.2 fallback headings were not truncated; the cache read is already size bounded.
    if(!chapter||!text(chapter.id,80)||ids.has(chapter.id)||!text(chapter.title,8*1024*1024)||
      typeof chapter.text!=='string'||!chapter.text.trim()||chapter.start!==length){
      throw Error('书籍章节数据异常，原文件已保留。');
    }
    ids.add(chapter.id);length+=chapter.text.length;
    if(length>5_000_000)throw Error('书籍正文超过限制，原文件已保留。');
  }
  if(length!==book.totalChars||!Number.isSafeInteger(book.totalChars)||
    (metadata&&['id','title','format','totalChars'].some(key=>book[key]!==metadata[key]))){
    throw Error('书籍与书架记录不一致，原文件已保留。');
  }
  return book;
}
