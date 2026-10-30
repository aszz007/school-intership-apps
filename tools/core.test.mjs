import test from 'node:test';
import assert from 'node:assert/strict';
import {validDate,shanghaiToday,dueState,readTasks,selectTasks,readNotes,renderMarkdown,safeUrl,safeFilename,forecastUrl,validateWeather,CITIES,markdownFileNote} from '../projects/shared/core.mjs';
const base={id:'task-1',title:'实验报告',done:false,createdAt:'2026-10-12T18:00:00Z'};
const current={...base,dueDate:'',priority:'medium',category:'course'};
test('Markdown文件可导回新笔记，保留中文和代码原文，非法文件拒绝',()=>{
  const body='# 中文笔记\n\n```js\nconsole.log("原文");\n```\n<script>按文字显示</script>\n';
  const note=markdownFileNote('课程笔记.MD',body,'import-1','2026-10-14T01:00:00Z');
  assert.equal(note.title,'课程笔记');assert.equal(note.body,body);assert.equal(note.example,false);
  assert.equal(markdownFileNote('带BOM.md','\uFEFF'+body,'import-2',note.updatedAt).body,body);
  assert.throws(()=>markdownFileNote('网页.html',body,'x',note.updatedAt));
  assert.throws(()=>markdownFileNote('超长.md','x'.repeat(100001),'x',note.updatedAt));
  assert.equal(readNotes({version:1,notes:[note]})[0].body,body);
});
test('天气异常日期、顺序、秒数和预报极值不能被当成有效响应',()=>{
  const data={current:{time:'2026-10-14T10:00:59',temperature_2m:20,apparent_temperature:19,relative_humidity_2m:60,wind_speed_10m:8,weather_code:2,is_day:1},daily:{time:['2026-10-14','2026-10-15','2026-10-16'],weather_code:[2,3,61],temperature_2m_max:[22,23,21],temperature_2m_min:[15,16,14],precipitation_probability_max:[0,10,50]}};
  assert.equal(validateWeather(data),data);
  for(const dates of [['','',''],['2026-10-14','2026-10-14','2026-10-16'],['2026-10-14','2026-10-16','2026-10-15'],['2026-10-14','2026-10-16','2026-10-17']])assert.throws(()=>validateWeather({...data,daily:{...data.daily,time:dates}}));
  assert.throws(()=>validateWeather({...data,current:{...data.current,time:'2026-10-14T10:00:99'}}));
  assert.throws(()=>validateWeather({...data,daily:{...data.daily,temperature_2m_max:[1000,23,21]}}));
});
test('上海午夜与闰年日历不受UTC日期偏移影响',()=>{assert.equal(shanghaiToday(new Date('2026-10-12T16:01:00Z')),'2026-10-13');assert.equal(validDate('2024-02-29'),true);assert.equal(validDate('2026-02-29'),false);assert.equal(validDate('2026-13-01'),false);assert.equal(dueState({...base,dueDate:''},'2026-10-13'),'');assert.equal(dueState({...base,dueDate:'2026-10-12'},'2026-10-13'),'已逾期');assert.equal(dueState({...base,done:true,dueDate:'2026-10-12'},'2026-10-13'),'');assert.equal(dueState({...base,dueDate:'2026-10-13'},'2026-10-13'),'今日截止');});
test('旧任务无损迁移，非法备份整体拒绝',()=>{const migrated=readTasks({version:1,tasks:[{...base,example:true}]});assert.equal(migrated[0].title,base.title);assert.equal(migrated[0].example,true);assert.equal(migrated[0].priority,'medium');assert.equal(migrated[0].dueDate,'');assert.throws(()=>readTasks({version:2,tasks:[current,{...current}]}));assert.throws(()=>readTasks({version:2,tasks:[current,{...current,id:'2',dueDate:'2026-02-30'}]}));assert.throws(()=>readTasks({version:2,tasks:[{...current,title:' '.repeat(3)}]}));assert.throws(()=>readTasks({version:2,tasks:[{...current,priority:'urgent'}]}));
  for(const field of ['dueDate','priority','category']){const missing={...current};delete missing[field];assert.throws(()=>readTasks({version:2,tasks:[current,{...missing,id:'2'}]}));assert.throws(()=>readTasks({version:2,tasks:[{...current,[field]:null}]}));}
  assert.equal(readTasks({version:2,tasks:[current]})[0].dueDate,'');assert.equal(migrated[0].category,'course');
});
test('搜索、分类、完成状态组合并保留源数组',()=>{const tasks=readTasks({version:2,tasks:[{...current,id:'1',priority:'high',category:'course',dueDate:'2026-10-14'},{...current,id:'2',title:'图书馆',category:'daily',priority:'low'},{...current,id:'3',done:true,priority:'medium',category:'course',dueDate:'2026-10-13'}]});assert.deepEqual(selectTasks(tasks,{state:'pending',query:'报告',category:'course'}).map(t=>t.id),['1']);assert.deepEqual(selectTasks(tasks,{sort:'due'}).map(t=>t.id),['3','1','2']);assert.deepEqual(selectTasks(tasks,{sort:'priority'}).map(t=>t.id),['1','3','2']);assert.equal(tasks[0].id,'1');});
test('Markdown常用结构可预览，HTML和危险链接保持为文字',()=>{const html=renderMarkdown('# 中文标题\n\n**重点** 与 `a < b`\n\n- 条目\n\n> 引用\n\n```js\n<img src=x onerror=alert(1)>\n```\n\n<script>alert(1)</script>\n\n[危险](javascript:alert) [危险2](data:text/html,x) [正常](https://example.com)');assert.match(html,/<h1>中文标题<\/h1>/);assert.match(html,/<strong>重点<\/strong>/);assert.match(html,/<ul><li>条目<\/li><\/ul>/);assert.match(html,/<blockquote>/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script|<img|href="javascript:|href="data:/i);assert.match(html,/href="https:\/\/example.com\/"/);assert.equal(safeUrl('javascript:alert(1)'),null);assert.equal(safeUrl('//example.com'),null);});
test('笔记存储字段与下载文件名处理',()=>{const note={id:'n1',title:'A/B:测试',body:'中文\n代码',updatedAt:'2026-10-12T18:00:00Z'};assert.deepEqual(readNotes({version:1,notes:[note]})[0].body,note.body);assert.throws(()=>readNotes({version:1,notes:[note,note]}));assert.throws(()=>readNotes({version:1,notes:[{...note,body:'x'.repeat(100001)}]}));assert.equal(safeFilename(note.title,'md'),'A_B_测试.md');assert.equal(safeFilename('CON','md'),'_CON.md');});
test('天气请求按城市经纬度形成，缺失数据不能视为成功',()=>{const u=new URL(forecastUrl(CITIES[0]));assert.equal(u.searchParams.get('latitude'),'39.9042');assert.equal(u.searchParams.get('timezone'),'Asia/Shanghai');assert.equal(u.searchParams.has('apikey'),false);const data={current:{time:'2026-10-13T10:00',temperature_2m:20,apparent_temperature:19,relative_humidity_2m:60,wind_speed_10m:8,weather_code:2,is_day:1},daily:{time:['2026-10-13','2026-10-14','2026-10-15'],weather_code:[2,3,61],temperature_2m_max:[22,23,21],temperature_2m_min:[15,16,14],precipitation_probability_max:[0,10,50]}};assert.equal(validateWeather(data),data);assert.throws(()=>validateWeather({current:{temperature_2m:20}}));assert.throws(()=>validateWeather({...data,current:{...data.current,temperature_2m:null}}));});
