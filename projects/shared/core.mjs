export function shanghaiToday(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const values=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
export function validDate(value) {
  if(value==='') return true;
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y,m,d]=value.split('-').map(Number), dt=new Date(Date.UTC(y,m-1,d));
  return y>=1900 && y<=2199 && dt.getUTCFullYear()===y && dt.getUTCMonth()===m-1 && dt.getUTCDate()===d;
}
export function dueState(task,today=shanghaiToday()) {
  if(task.done || !task.dueDate) return '';
  return task.dueDate<today?'已逾期':task.dueDate===today?'今日截止':'';
}
export function readTasks(data) {
  if(!data || ![1,2].includes(data.version) || !Array.isArray(data.tasks) || data.tasks.length>5000) throw new Error('任务文件格式不正确');
  const ids=new Set();
  return data.tasks.map(t=>{
    if(!t || typeof t.id!=='string' || !t.id || t.id.length>150 || ids.has(t.id) || typeof t.title!=='string' || !t.title.trim() || t.title.length>120 || typeof t.done!=='boolean' || typeof t.createdAt!=='string' || !Number.isFinite(Date.parse(t.createdAt))) throw new Error('任务字段或编号不正确');
    ids.add(t.id);
    const legacy=data.version===1;
    const dueDate=legacy?(t.dueDate??''):t.dueDate, priority=legacy?(t.priority??'medium'):t.priority, category=legacy?(t.category??'course'):t.category;
    if(!validDate(dueDate) || !['low','medium','high'].includes(priority) || !['course','daily'].includes(category)) throw new Error('日期、优先级或分类不正确');
    return {id:t.id,title:t.title.trim(),done:t.done,createdAt:t.createdAt,dueDate,priority,category,example:t.example===true};
  });
}
export function selectTasks(tasks,{state='all',query='',category='all',sort='created'}={}) {
  const q=query.trim().toLocaleLowerCase('zh-CN');
  const selected=tasks.filter(t=>(state==='all'||(state==='done'?t.done:!t.done))&&(category==='all'||t.category===category)&&t.title.toLocaleLowerCase('zh-CN').includes(q));
  const weight={high:0,medium:1,low:2};
  return selected.sort((a,b)=>sort==='due'? (a.dueDate||'9999').localeCompare(b.dueDate||'9999') || b.createdAt.localeCompare(a.createdAt) : sort==='priority'?weight[a.priority]-weight[b.priority] || b.createdAt.localeCompare(a.createdAt):b.createdAt.localeCompare(a.createdAt));
}
export function safeFilename(title,extension) {
  const clean=String(title).replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/[. ]+$/,'').trim().slice(0,80)||'未命名';
  return `${/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(clean)?`_${clean}`:clean}.${extension}`;
}
export function safeUrl(raw) {
  const value=String(raw).trim();
  if(!/^https?:\/\//i.test(value)) return null;
  try { const u=new URL(value); return ['http:','https:'].includes(u.protocol)?u.href:null; } catch{return null;}
}
export const WEATHER_CODES={0:['晴','☀'],1:['大部晴朗','☀'],2:['局部多云','⛅'],3:['阴','☁'],45:['雾','≋'],48:['雾凇','≋'],51:['小毛毛雨','☂'],53:['毛毛雨','☂'],55:['较强毛毛雨','☂'],56:['轻冻毛毛雨','☂'],57:['冻毛毛雨','☂'],61:['小雨','☂'],63:['中雨','☂'],65:['大雨','☂'],66:['轻冻雨','☂'],67:['冻雨','☂'],71:['小雪','❄'],73:['中雪','❄'],75:['大雪','❄'],77:['雪粒','❄'],80:['小阵雨','☂'],81:['阵雨','☂'],82:['强阵雨','☂'],85:['小阵雪','❄'],86:['阵雪','❄'],95:['雷雨','ϟ'],96:['雷雨伴冰雹','ϟ'],99:['强雷雨伴冰雹','ϟ']};
export const CITIES=[{name:'北京',admin1:'北京市',country:'中国',latitude:39.9042,longitude:116.4074},{name:'上海',admin1:'上海市',country:'中国',latitude:31.2304,longitude:121.4737},{name:'广州',admin1:'广东省',country:'中国',latitude:23.1291,longitude:113.2644},{name:'成都',admin1:'四川省',country:'中国',latitude:30.5728,longitude:104.0668},{name:'武汉',admin1:'湖北省',country:'中国',latitude:30.5928,longitude:114.3055},{name:'杭州',admin1:'浙江省',country:'中国',latitude:30.2741,longitude:120.1551},{name:'深圳',admin1:'广东省',country:'中国',latitude:22.5431,longitude:114.0579},{name:'南京',admin1:'江苏省',country:'中国',latitude:32.0603,longitude:118.7969},{name:'西安',admin1:'陕西省',country:'中国',latitude:34.3416,longitude:108.9398},{name:'重庆',admin1:'重庆市',country:'中国',latitude:29.563,longitude:106.5516}];
export function forecastUrl(city) {
  const params=new URLSearchParams({latitude:String(city.latitude),longitude:String(city.longitude),current:'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day',daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',forecast_days:'3',timezone:'Asia/Shanghai'});
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}
// GeoNames China city listing: https://www.geonames.org/search.html?country=CN
CITIES.push({name:'大连',admin1:'辽宁省',country:'中国',latitude:38.91222,longitude:121.60222});
export function validateWeather(data) {
  const c=data?.current,d=data?.daily;
  if(!c || typeof c.time!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(c.time) || !validDate(c.time.slice(0,10)) || Number(c.time.slice(11,13))>23 || Number(c.time.slice(14,16))>59 || (c.time.length===19 && Number(c.time.slice(17,19))>59) || !Number.isFinite(c.temperature_2m) || !Number.isFinite(c.apparent_temperature) || !Number.isFinite(c.relative_humidity_2m) || !Number.isFinite(c.wind_speed_10m) || !WEATHER_CODES[c.weather_code] || ![0,1].includes(c.is_day)) throw new Error('天气接口字段不完整');
  if(c.temperature_2m < -90 || c.temperature_2m>70 || c.apparent_temperature < -100 || c.apparent_temperature>90 || c.relative_humidity_2m<0 || c.relative_humidity_2m>100 || c.wind_speed_10m<0 || c.wind_speed_10m>600) throw new Error('天气接口数值超出范围');
  if(!d || !Array.isArray(d.time) || d.time.length<3 || !['weather_code','temperature_2m_max','temperature_2m_min','precipitation_probability_max'].every(k=>Array.isArray(d[k]) && d[k].length>=3 && d[k].slice(0,3).every(Number.isFinite))) throw new Error('预报接口字段不完整');
  if(d.time.slice(0,3).some((day,i)=>!day || !validDate(day) || (i>0 && Date.parse(day)-Date.parse(d.time[i-1])!==86400000) || !WEATHER_CODES[d.weather_code[i]] || d.temperature_2m_max[i]<d.temperature_2m_min[i] || d.temperature_2m_min[i]<-90 || d.temperature_2m_max[i]>70 || d.precipitation_probability_max[i]<0 || d.precipitation_probability_max[i]>100)) throw new Error('预报接口数值不合法');
  return data;
}
export function readNotes(data) {
  if(!data || data.version!==1 || !Array.isArray(data.notes) || data.notes.length>1000) throw new Error('笔记文件格式不正确');
  const ids=new Set();
  return data.notes.map(n=>{
    if(!n || typeof n.id!=='string' || !n.id || ids.has(n.id) || typeof n.title!=='string' || n.title.length>80 || typeof n.body!=='string' || n.body.length>100000 || typeof n.updatedAt!=='string' || !Number.isFinite(Date.parse(n.updatedAt))) throw new Error('笔记字段不正确');
    ids.add(n.id); return {id:n.id,title:n.title,body:n.body,updatedAt:n.updatedAt,example:n.example===true};
  });
}
export function markdownFileNote(filename,body,id,updatedAt) {
  if(typeof filename!=='string' || !/\.md$/i.test(filename)) throw new Error('请选择.md格式的笔记文件');
  if(typeof body!=='string') throw new Error('无法读取笔记正文');
  const title=filename.replace(/\.md$/i,'').trim().slice(0,80)||'导入笔记';
  return readNotes({version:1,notes:[{id,title,body:body.replace(/^\uFEFF/,''),updatedAt,example:false}]})[0];
}
export const escapeHtml = text=>String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
function inlineMarkdown(text,depth=0) {
  if(depth>4) return escapeHtml(text);
  const token=/`([^`\n]+)`|\*\*([^*\n]+)\*\*|\[([^\]\n]{1,300})\]\(([^()\s]{1,2000})\)/g;
  let result='',last=0;
  for(const m of text.matchAll(token)) {
    result+=escapeHtml(text.slice(last,m.index));
    if(m[1]!==undefined) result+=`<code>${escapeHtml(m[1])}</code>`;
    else if(m[2]!==undefined) result+=`<strong>${inlineMarkdown(m[2],depth+1)}</strong>`;
    else { const href=safeUrl(m[4]); result+=href?`<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${inlineMarkdown(m[3],depth+1)}</a>`:escapeHtml(m[0]); }
    last=m.index+m[0].length;
  }
  return result+escapeHtml(text.slice(last));
}
export function renderMarkdown(text) {
  const lines=String(text).replace(/\r\n?/g,'\n').split('\n');
  let html='',paragraph=[],list=null,code=[],fenced=false;
  const flush=()=>{if(paragraph.length){html+=`<p>${paragraph.map(x=>inlineMarkdown(x)).join('<br>')}</p>`;paragraph=[];}};
  const closeList=()=>{if(list){html+=`</${list}>`;list=null;}};
  for(const line of lines) {
    if(/^\s*```/.test(line)){flush();closeList();if(fenced){html+=`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`;code=[];}fenced=!fenced;continue;}
    if(fenced){code.push(line);continue;}
    if(!line.trim()){flush();closeList();continue;}
    const h=line.match(/^(#{1,6})\s+(.+)$/),li=line.match(/^\s*(?:([-+*])|\d+[.)])\s+(.+)$/),quote=line.match(/^>\s?(.*)$/);
    if(h){flush();closeList();html+=`<h${h[1].length}>${inlineMarkdown(h[2])}</h${h[1].length}>`;}
    else if(/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)){flush();closeList();html+='<hr>';}
    else if(li){flush();const kind=li[1]?'ul':'ol';if(list!==kind){closeList();list=kind;html+=`<${kind}>`;}html+=`<li>${inlineMarkdown(li[2])}</li>`;}
    else if(quote){flush();closeList();html+=`<blockquote><p>${inlineMarkdown(quote[1])}</p></blockquote>`;}
    else {closeList();paragraph.push(line);}
  }
  if(fenced) html+=`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`;
  flush();closeList();return html;
}
