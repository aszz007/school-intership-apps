import {readTasks,selectTasks,dueState,validDate,shanghaiToday} from '../shared/core.mjs';
const KEY='campus-list.tasks.v1',$=id=>document.getElementById(id);
let tasks=[],filter='all',undoSnapshot=null,toastTimer,storageAvailable=true,editId=null,editTrigger=null,imported=null;
function warn(message){storageAvailable=false;$('storage-warning').hidden=false;$('storage-warning').textContent=message;$('storage-status').textContent='本次会话临时保存';}
try {const raw=localStorage.getItem(KEY);if(raw!==null) tasks=readTasks(JSON.parse(raw));}catch{warn('无法读取保存的任务，本次可临时使用。原有存储不会被自动覆盖，请保留备份。');}
function persist(){if(!storageAvailable)return;try{localStorage.setItem(KEY,JSON.stringify({version:2,tasks}));}catch{warn('浏览器保存失败，当前任务仅在本次页面保留。请导出备份，避免刷新。');}}
const uid=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
function notify(text,undo=false){clearTimeout(toastTimer);$('toast-message').textContent=text;$('undo-button').hidden=!undo;$('toast').hidden=false;toastTimer=setTimeout(()=>{$('toast').hidden=true;undoSnapshot=null;},undo?12000:3500);}
function setError(message){$('input-error').textContent=message;$('input-error').hidden=false;$('task-input').setAttribute('aria-invalid','true');}
function mutate(fn,message,undo=false){undoSnapshot=undo?structuredClone(tasks):null;tasks=fn(tasks);persist();render();notify(message,undo);}
function render(){
  const completed=tasks.filter(t=>t.done).length,pending=tasks.length-completed,progress=tasks.length?Math.round(completed/tasks.length*100):0;
  [['nav-all',tasks.length],['nav-pending',pending],['nav-done',completed],['stat-all',tasks.length],['stat-pending',pending],['stat-done',completed],['stat-progress',progress],['list-count',tasks.length]].forEach(([id,n])=>$(id).textContent=String(n));
  $('progress-fill').style.width=`${progress}%`;$('progress-bar').setAttribute('aria-valuenow',String(progress));$('clear-completed').disabled=!completed;$('load-examples').disabled=tasks.some(t=>t.example);
  $('remaining-label').textContent=pending?`还有${pending}件事待完成`:tasks.length?'全部完成。':'暂时没有任务';
  document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.filter===filter);b.setAttribute('aria-pressed',String(b.dataset.filter===filter));});
  const visible=selectTasks(tasks,{state:filter,query:$('task-search').value,category:$('category-filter').value,sort:$('sort-tasks').value});
  $('match-label').textContent=`匹配 ${visible.length} 条 / 全部 ${tasks.length} 条`;$('task-list').replaceChildren();
  visible.forEach(task=>{
    const row=document.createElement('li');row.className=`task-row${task.done?' is-done':''}`;row.dataset.id=task.id;
    const check=document.createElement('input');check.type='checkbox';check.className='task-check';check.checked=task.done;check.setAttribute('aria-label',`${task.done?'取消完成':'完成'}：${task.title}`);
    check.addEventListener('change',()=>{mutate(all=>all.map(t=>t.id===task.id?{...t,done:check.checked}:t),check.checked?'任务已完成':'任务已恢复');$('task-list').querySelector(`[data-id="${CSS.escape(task.id)}"] input`)?.focus();});
    const text=document.createElement('div');text.className='task-text';const title=document.createElement('span');title.className='task-title';title.textContent=task.title;
    const meta=document.createElement('span');meta.className='task-meta';meta.textContent=`${task.example?'示例任务 · ':''}${task.category==='course'?'课程':'日常'}`;
    const badges=document.createElement('div');badges.className='task-badges';const priority=document.createElement('span');priority.className=`task-priority ${task.priority}`;priority.textContent=`${{high:'高',medium:'中',low:'低'}[task.priority]}优先级`;badges.append(priority);
    if(task.dueDate){const due=document.createElement('span'),state=dueState(task);due.className=`task-due ${state==='已逾期'?'overdue':state==='今日截止'?'today':''}`;due.textContent=`${task.dueDate}${state?` · ${state}`:''}`;badges.append(due);}
    text.append(title,meta,badges);const edit=document.createElement('button');edit.type='button';edit.className='edit-task';edit.textContent='编辑';edit.setAttribute('aria-label',`编辑：${task.title}`);edit.addEventListener('click',()=>openEdit(task,edit));
    const remove=document.createElement('button');remove.type='button';remove.className='delete-task';remove.textContent='×';remove.setAttribute('aria-label',`删除：${task.title}`);remove.addEventListener('click',()=>mutate(all=>all.filter(t=>t.id!==task.id),'任务已删除',true));
    row.append(check,text,edit,remove);$('task-list').append(row);
  });
  $('empty-state').hidden=visible.length>0;$('empty-title').textContent=tasks.length?'没有匹配的任务':'暂无任务';$('empty-description').textContent=tasks.length?'试试其他关键词、分类或完成状态。':'在上方输入标题，点击“添加”。';
}
function openEdit(task,trigger){editId=task.id;editTrigger=trigger;$('edit-task-title').value=task.title;$('edit-task-due').value=task.dueDate;$('edit-task-priority').value=task.priority;$('edit-task-category').value=task.category;$('edit-error').hidden=true;$('edit-dialog').showModal();$('edit-task-title').focus();}
$('edit-form').addEventListener('submit',e=>{e.preventDefault();const title=$('edit-task-title').value.trim(),dueDate=$('edit-task-due').value;if(!title||!validDate(dueDate)){$('edit-error').textContent=!title?'标题不能为空':'请输入有效截止日期';$('edit-error').hidden=false;return;}mutate(all=>all.map(t=>t.id===editId?{...t,title,dueDate,priority:$('edit-task-priority').value,category:$('edit-task-category').value}:t),'任务已更新');$('edit-dialog').close();});
$('cancel-edit').addEventListener('click',()=>$('edit-dialog').close());$('edit-dialog').addEventListener('close',()=>{if(editTrigger?.isConnected)editTrigger.focus();else $('task-input').focus();});
$('add-form').addEventListener('submit',e=>{e.preventDefault();const title=$('task-input').value.trim(),dueDate=$('task-due').value;if(!title){setError('空白任务不能添加。');$('task-input').focus();return;}if(!validDate(dueDate)){setError('请输入有效截止日期。');return;}
  filter='all';$('task-search').value='';$('category-filter').value='all';mutate(all=>[{id:uid(),title:title.slice(0,120),done:false,createdAt:new Date().toISOString(),example:false,dueDate,priority:$('task-priority').value,category:$('task-category').value},...all],'任务已添加');$('task-input').value='';$('input-error').hidden=true;$('task-input').removeAttribute('aria-invalid');$('task-input').focus();});
$('task-input').addEventListener('input',()=>{$('input-error').hidden=true;$('task-input').removeAttribute('aria-invalid');});
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;render();}));
['task-search','category-filter','sort-tasks'].forEach(id=>$(id).addEventListener(id==='task-search'?'input':'change',render));
$('load-examples').addEventListener('click',()=>{if(tasks.some(t=>t.example))return;filter='all';$('task-search').value='';$('category-filter').value='all';const today=shanghaiToday();mutate(all=>[...all,...['整理企业实习的任务清单','完成第一个网页小工具','测试手机端的显示效果','保存作品截图与迭代记录'].map((title,i)=>({id:uid(),title,done:i===0,createdAt:new Date(Date.now()-i).toISOString(),example:true,dueDate:i===1?today:'',priority:i===1?'high':'medium',category:i===3?'daily':'course'}))],'已加入4个明确示例任务',true);});
$('clear-completed').addEventListener('click',()=>{if(tasks.some(t=>t.done))mutate(all=>all.filter(t=>!t.done),'已清理完成任务',true);});
$('undo-button').addEventListener('click',()=>{if(!undoSnapshot)return;tasks=undoSnapshot;undoSnapshot=null;persist();render();notify('已撤销上一步操作');});
$('dismiss-toast').addEventListener('click',()=>{$('toast').hidden=true;clearTimeout(toastTimer);undoSnapshot=null;});
function download(contents,filename){const url=URL.createObjectURL(new Blob([contents],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export-tasks').addEventListener('click',()=>{download(JSON.stringify({version:2,exportedAt:new Date().toISOString(),tasks},null,2),`课间备份-${shanghaiToday()}.json`);notify('已下载任务备份');});
$('import-tasks').addEventListener('click',()=>$('import-file').click());
$('import-file').addEventListener('change',async()=>{const file=$('import-file').files[0];$('import-file').value='';if(!file)return;try{if(file.size>3*1024*1024)throw new Error('文件不能超过3MB');imported=readTasks(JSON.parse(await file.text()));$('import-description').textContent=`文件包含${imported.length}条任务，当前有${tasks.length}条。`;$('import-dialog').showModal();}catch(error){imported=null;notify(`导入失败：${error.message}`);}});
$('cancel-import').addEventListener('click',()=>$('import-dialog').close());$('confirm-import').addEventListener('click',()=>{if(!imported)return;filter='all';$('task-search').value='';$('category-filter').value='all';mutate(()=>imported,'备份已导入',true);imported=null;$('import-dialog').close();});
window.addEventListener('storage',e=>{if(e.key!==KEY||!storageAvailable)return;try{tasks=e.newValue===null?[]:readTasks(JSON.parse(e.newValue));undoSnapshot=null;render();notify('已同步其他页面的修改');}catch{warn('其他页面的保存数据异常。本次改为临时保存，原数据不会被覆盖。');}});
$('today-label').textContent=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'long',day:'numeric',weekday:'long'}).format(new Date());render();
