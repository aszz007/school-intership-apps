import { createApp, ref, reactive, computed, onMounted } from 'vue/dist/vue.esm-bundler.js';
import './style.css';

createApp({
  setup() {
    const user=ref(null), csrf=ref(''), ready=ref(false), busy=ref(false), notice=ref(''), error=ref('');
    const screen=ref('practice'), authMode=ref('login'), auth=reactive({username:'',password:'',display_name:''});
    const filters=reactive({topic:'',difficulty:'',q:'',mastery:'pending',include_archived:false});
    const questions=ref([]), topics=ref([]), current=ref(0), selected=ref([]), result=ref(null), reviews=ref([]);
    const stats=ref({attempts:0,correct:0,covered:0,pending:0,topics:[],days:[]}), editor=ref(null);
    const active=computed(()=>questions.value[current.value]);
    const review=computed(()=>reviews.value.find(r=>r.question_id===active.value?.id));
    const note=ref(''), mastered=ref(false), requestId=ref(crypto.randomUUID());
    const title=computed(()=>({practice:'开始练习',wrong:'错题复习',stats:'学习统计',own:'我的题目'})[screen.value]);
    const accuracy=computed(()=>stats.value.attempts?Math.round(stats.value.correct/stats.value.attempts*100):0);
    const chartMax=computed(()=>Math.max(1,...stats.value.days.map(d=>d.attempts)));
    const letters=i=>String.fromCharCode(65+i);
    function clearMessages(){notice.value='';error.value='';}
    async function api(path,method='GET',body){
      const headers={}; if(body!==undefined)headers['Content-Type']='application/json';
      if(csrf.value)headers['X-CSRF-Token']=csrf.value;
      const res=await fetch('/api'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),credentials:'same-origin'});
      const data=await res.json();
      if(!res.ok){
        if(res.status===401&&!['/login','/register'].includes(path)){user.value=null;csrf.value='';}
        throw new Error(typeof data.detail==='string'?data.detail:(data.detail?.[0]?.msg||'操作失败，请稍后重试。'));
      }
      return data;
    }
    async function action(work){if(busy.value)return;clearMessages();busy.value=true;try{await work();}catch(e){error.value=e.message==='Failed to fetch'?'无法连接服务，请确认本地服务仍在运行，然后重试。':e.message;}finally{busy.value=false;}}
    function resetAnswer(){selected.value=[];result.value=null;requestId.value=crypto.randomUUID();note.value=review.value?.note||'';mastered.value=!!review.value?.mastered;}
    async function refreshStats(){stats.value=await api('/stats');}
    async function refreshReviews(){reviews.value=(await api('/reviews')).items;}
    async function loadQuestions(){
      const params=new URLSearchParams({...filters,mode:screen.value==='wrong'?'wrong':screen.value==='own'?'own':'all'});
      const data=await api('/questions?'+params);questions.value=data.items;topics.value=data.topics;current.value=0;resetAnswer();
    }
    async function bootstrap(){await Promise.all([refreshStats(),refreshReviews()]);await loadQuestions();}
    async function authenticate(){await action(async()=>{
      const payload={username:auth.username,password:auth.password};if(authMode.value==='register')payload.display_name=auth.display_name;
      const data=await api('/'+(authMode.value==='register'?'register':'login'),'POST',payload);
      user.value=data.user;csrf.value=data.csrf;auth.password='';screen.value='practice';await bootstrap();notice.value='已登录，可以开始练习。';
    });}
    async function logout(){await action(async()=>{await api('/logout','POST',{});user.value=null;csrf.value='';questions.value=[];reviews.value=[];editor.value=null;});}
    async function navigate(next){await action(async()=>{screen.value=next;editor.value=null;filters.q='';filters.topic='';filters.difficulty='';filters.mastery='pending';filters.include_archived=false;await Promise.all([refreshStats(),refreshReviews()]);if(next!=='stats')await loadQuestions();});}
    async function search(){await action(loadQuestions);}
    async function resetFilters(){filters.topic='';filters.difficulty='';filters.q='';filters.mastery='pending';filters.include_archived=false;await search();}
    function choose(i){if(result.value||busy.value)return;selected.value=active.value.kind==='single'?[i]:(selected.value.includes(i)?selected.value.filter(x=>x!==i):[...selected.value,i]);requestId.value=crypto.randomUUID();}
    async function submit(){await action(async()=>{
      if(!selected.value.length)throw new Error('请先选择答案。');
      result.value=await api('/attempts','POST',{question_id:active.value.id,answers:selected.value,request_id:requestId.value});
      await Promise.all([refreshStats(),refreshReviews()]);note.value=review.value?.note||'';mastered.value=!!review.value?.mastered;
    });}
    function move(offset){if(busy.value)return;current.value=Math.max(0,Math.min(questions.value.length-1,current.value+offset));resetAnswer();clearMessages();}
    function optionClass(i){if(!result.value)return selected.value.includes(i)?'chosen':'';if(result.value.correct_answers.includes(i))return 'answer-correct';if(selected.value.includes(i))return 'answer-wrong';return '';}
    async function saveReview(){await action(async()=>{await api('/reviews/'+active.value.id,'PUT',{note:note.value,mastered:mastered.value});await Promise.all([refreshReviews(),refreshStats()]);if(screen.value==='wrong'&&((filters.mastery==='pending'&&mastered.value)||(filters.mastery==='mastered'&&!mastered.value)))await loadQuestions();notice.value='复习笔记已保存。';});}
    function openEditor(q){clearMessages();editor.value=q?{...q,options:[...q.options],correct:[...q.correct]}:{topic:'',difficulty:'基础',kind:'single',prompt:'',options:['','','',''],correct:[],explanation:'',version:1,archived:false};}
    function chooseCorrect(i){const e=editor.value;e.correct=e.kind==='single'?[i]:(e.correct.includes(i)?e.correct.filter(x=>x!==i):[...e.correct,i]);}
    function bodyFor(q){return Object.fromEntries(['topic','difficulty','kind','prompt','options','correct','explanation','version','archived'].map(k=>[k,q[k]]));}
    async function saveQuestion(){await action(async()=>{
      const e=editor.value;await api('/questions'+(e.id?'/'+e.id:''),e.id?'PUT':'POST',bodyFor(e));editor.value=null;await loadQuestions();notice.value='题目已保存。';
    });}
    async function archive(q){await action(async()=>{await api('/questions/'+q.id,'PUT',{...bodyFor(q),archived:!q.archived});await Promise.all([loadQuestions(),refreshStats()]);notice.value=q.archived?'题目已恢复。':'题目已归档。勾选“显示归档题目”可以恢复。';});}
    onMounted(async()=>{try{const data=await api('/session');user.value=data.user;csrf.value=data.csrf;if(user.value)await bootstrap();}catch(e){error.value=e.message;}finally{ready.value=true;}});
    return {user,ready,busy,notice,error,screen,authMode,auth,filters,questions,topics,current,selected,result,stats,editor,active,review,note,mastered,title,accuracy,chartMax,letters,authenticate,logout,navigate,search,resetFilters,choose,submit,move,optionClass,saveReview,openEditor,chooseCorrect,saveQuestion,archive,resetAnswer};
  },
  template: `
  <div v-if="!ready" class="loading" role="status">正在连接知练…</div>
  <div v-else-if="!user" class="auth-shell">
    <section class="intro"><a class="brand" href="/">知练<span>软件开发练习</span></a><div class="intro-body"><h1>软件开发知识练习</h1><p>分类答题、查看解析、复习错题，记录保存在本机。</p><div class="intro-path"><span>分类练习</span><span>错题复习</span><span>学习统计</span></div></div><small>18 道软件开发基础题，支持自建题库</small></section>
    <main class="auth-main"><form class="auth-form" @submit.prevent="authenticate">
      <h2>{{authMode==='login'?'登录知练':'创建账号'}}</h2><p>{{authMode==='login'?'登录后继续练习，记录会保存在本机。':'创建独立账号，题目与学习记录互相隔离。'}}</p>
      <label>用户名<input v-model="auth.username" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_]+" autocomplete="username" placeholder="3–24位字母、数字或下划线"></label>
      <label v-if="authMode==='register'">称呼<input v-model="auth.display_name" maxlength="30" autocomplete="nickname" placeholder="可选，用来称呼你"></label>
      <label>密码<input v-model="auth.password" type="password" required minlength="10" maxlength="128" :autocomplete="authMode==='login'?'current-password':'new-password'" placeholder="至少10个字符"></label>
      <p v-if="error" class="error" role="alert">{{error}}</p><button class="primary" :disabled="busy">{{busy?'正在连接…':authMode==='login'?'登录':'创建账号'}}</button>
      <button class="text-button" type="button" :disabled="busy" @click="authMode=authMode==='login'?'register':'login';error=''">{{authMode==='login'?'还没有账号？创建一个':'已有账号？返回登录'}}</button>
    </form></main>
  </div>
  <div v-else class="workspace">
    <aside class="sidebar"><a class="brand" href="/">知练<span>软件开发练习</span></a>
      <nav aria-label="学习导航"><button v-for="item in [['practice','开始练习'],['wrong','错题复习'],['stats','学习统计'],['own','我的题目']]" :key="item[0]" :class="{active:screen===item[0]}" :aria-current="screen===item[0]?'page':undefined" @click="navigate(item[0])" :disabled="busy">{{item[1]}}<span v-if="item[0]==='wrong'&&stats.pending" class="count">{{stats.pending}}</span></button></nav>
      <div class="sidebar-bottom"><p>{{user.display_name}}<small>@{{user.username}}</small></p><a href="/api/export" download>导出学习记录</a><button class="text-button" @click="logout" :disabled="busy">退出登录</button></div>
    </aside>
    <main class="main"><header class="page-heading"><div><h1>{{title}}</h1></div><button v-if="screen==='own'&&!editor" class="primary" @click="openEditor(null)" :disabled="busy">添加题目</button></header>
      <p v-if="error" class="notice error" role="alert">{{error}}</p><p v-if="notice" class="notice success" role="status">{{notice}}</p>
      <template v-if="editor">
        <form class="editor" @submit.prevent="saveQuestion"><h2>{{editor.id?'编辑题目':'新建题目'}}</h2><p>仅你可见。更新题目会保存新版本，原答题记录保留当时的内容。</p>
          <div class="form-row"><label>知识主题<input v-model="editor.topic" required maxlength="24" list="topic-list"></label><datalist id="topic-list"><option v-for="t in topics" :value="t"></option></datalist><label>难度<select v-model="editor.difficulty"><option>基础</option><option>进阶</option></select></label><label>题型<select v-model="editor.kind" @change="editor.correct=[]"><option value="single">单选</option><option value="multiple">多选</option></select></label></div>
          <label>题干<textarea v-model="editor.prompt" required minlength="5" maxlength="2000" rows="3"></textarea></label>
          <fieldset><legend>选项与正确答案</legend><p class="hint">{{editor.kind==='single'?'选中一个正确答案。':'至少选中两个正确答案。'}}</p><div v-for="(option,i) in editor.options" class="option-editor"><label class="correct-toggle"><input :type="editor.kind==='single'?'radio':'checkbox'" name="correct-answer" :checked="editor.correct.includes(i)" @change="chooseCorrect(i)" :aria-label="'设'+letters(i)+'为正确答案'">{{letters(i)}}</label><input v-model="editor.options[i]" :aria-label="'选项'+letters(i)" required maxlength="800"></div></fieldset>
          <label>答案解析<textarea v-model="editor.explanation" required minlength="5" maxlength="4000" rows="3"></textarea></label><div class="actions"><button class="primary" :disabled="busy">{{busy?'正在保存…':'保存题目'}}</button><button type="button" @click="editor=null" :disabled="busy">取消编辑</button></div>
        </form>
      </template>
      <template v-else-if="screen==='stats'">
        <div class="metrics"><div><span>完成答题</span><strong>{{stats.attempts}}<small>次</small></strong></div><div><span>正确率</span><strong>{{accuracy}}<small>%</small></strong></div><div><span>已练题目</span><strong>{{stats.covered}}<small>道</small></strong></div><div><span>待复习</span><strong>{{stats.pending}}<small>道</small></strong></div></div>
        <section class="stats-section"><h2>最近七天</h2><p class="hint">按北京时间统计，同一道题重做会计入答题次数。</p><div class="day-chart" role="list" aria-label="最近七天答题次数"><div v-for="day in stats.days" role="listitem" :aria-label="day.day+'答题'+day.attempts+'次，正确'+day.correct+'次'"><span>{{day.attempts}}次</span><div class="bar-track"><div class="bar" :style="{height:(day.attempts/chartMax*100)+'%'}"></div></div><small>{{day.day.slice(5)}}</small></div></div></section>
        <section class="stats-section"><h2>知识点分布</h2><div v-if="!stats.topics.length" class="empty compact"><p>还没有练习记录，完成一道题后这里就会更新。</p><button @click="navigate('practice')">去练习</button></div><table v-else><thead><tr><th>主题</th><th>答题次数</th><th>正确次数</th><th>覆盖题目</th></tr></thead><tbody><tr v-for="t in stats.topics"><th>{{t.topic}}</th><td>{{t.attempts}}</td><td>{{t.correct}}</td><td>{{t.covered}}</td></tr></tbody></table></section>
      </template>
      <template v-else>
        <form class="filters" @submit.prevent="search"><label>主题<select v-model="filters.topic" :disabled="busy"><option value="">全部主题</option><option v-for="t in topics" :value="t">{{t}}</option></select></label><label>难度<select v-model="filters.difficulty" :disabled="busy"><option value="">全部难度</option><option>基础</option><option>进阶</option></select></label><label v-if="screen==='wrong'">复习状态<select v-model="filters.mastery" :disabled="busy"><option value="pending">待复习</option><option value="mastered">已掌握</option><option value="all">全部错题</option></select></label><label class="search-field">搜索题目<input v-model="filters.q" :disabled="busy" maxlength="100" placeholder="输入题干关键词"></label><div class="filter-actions"><button :disabled="busy">查找题目</button><button type="button" class="text-button" @click="resetFilters" :disabled="busy">重置</button></div><label v-if="screen==='own'" class="check-label"><input type="checkbox" v-model="filters.include_archived" :disabled="busy" @change="search">显示归档题目</label></form>
        <div v-if="!questions.length" class="empty"><h2>{{screen==='wrong'?'当前没有匹配的错题':screen==='own'?'还没有匹配的个人题目':'没有找到匹配题目'}}</h2><p>{{screen==='wrong'?'答错的题会自动出现在这里；已掌握的题可通过上方状态查看。':screen==='own'?'可以添加自己的题目，或重置条件查看已有内容。':'试试清空关键词，或选择其他主题。'}}</p><div class="actions"><button @click="resetFilters">重置筛选</button><button v-if="screen==='wrong'" class="primary" @click="navigate('practice')">开始练习</button><button v-if="screen==='own'" class="primary" @click="openEditor(null)">添加题目</button></div></div>
        <section v-else-if="screen==='own'" class="question-list"><p class="hint">共{{questions.length}}道个人题目。归档后将不参与练习，可以随时恢复。</p><article v-for="q in questions" :key="q.id"><div><span class="meta">{{q.topic}} / {{q.kind==='single'?'单选':'多选'}} / 第{{q.version}}版 <em v-if="q.archived">已归档</em></span><h2>{{q.prompt}}</h2></div><div class="actions"><button @click="openEditor(q)" :disabled="busy">编辑</button><button class="text-button" @click="archive(q)" :disabled="busy">{{q.archived?'恢复':'归档'}}</button></div></article></section>
        <section v-else class="exercise" :aria-busy="busy"><div class="question-top"><span class="meta">{{active.topic}} / {{active.difficulty}} / {{active.kind==='single'?'单选':'多选'}}</span><span class="hint">第{{current+1}} / {{questions.length}}题</span></div><h2>{{active.prompt}}</h2><p class="hint">{{active.kind==='multiple'?'选择所有正确项，漏选或多选均不计为正确。':'请选择一个答案。'}}</p>
          <fieldset class="answer-options"><legend class="sr-only">选择答案</legend><label v-for="(option,i) in active.options" :key="active.id+'-'+i" :class="['answer-option',optionClass(i)]"><input :type="active.kind==='single'?'radio':'checkbox'" name="answer" :checked="selected.includes(i)" @change="choose(i)" :disabled="busy||!!result"><span class="option-letter">{{letters(i)}}</span><span>{{option}}</span><small v-if="result&&result.correct_answers.includes(i)" class="answer-label">正确选项</small><small v-else-if="result&&selected.includes(i)" class="answer-label">你的选择</small></label></fieldset>
          <div v-if="!result" class="actions"><button class="primary" @click="submit" :disabled="busy||!selected.length">{{busy?'正在判分…':'提交答案'}}</button><span class="hint">提交后显示答案与解析</span></div>
          <section v-else class="result" :class="result.correct?'result-correct':'result-wrong'" role="status"><h3>{{result.correct?'回答正确':'回答错误'}}</h3><p>正确答案：{{result.correct_answers.map(letters).join('、')}}　你的答案：{{result.answers.map(letters).join('、')}}</p><h4>知识解析</h4><p class="explanation">{{result.explanation}}</p><button class="text-button" @click="resetAnswer">再做一次</button></section>
          <form v-if="review" class="review-form" @submit.prevent="saveReview"><h3>我的复习笔记</h3><label><span class="sr-only">复习笔记</span><textarea v-model="note" maxlength="2000" rows="3" placeholder="记下哪里容易混淆，下次如何判断。"></textarea></label><div class="actions"><label class="check-label"><input type="checkbox" v-model="mastered">我已理解，标记掌握</label><button :disabled="busy">保存笔记</button></div></form>
          <footer class="question-navigation"><button @click="move(-1)" :disabled="busy||current===0">上一题</button><span class="hint">学习记录自动保存</span><button @click="move(1)" :disabled="busy||current>=questions.length-1">下一题</button></footer>
        </section>
      </template>
      <footer class="page-footer">知练 0.1.1<span>练习记录与个人题目保存在本机</span></footer>
    </main>
  </div>`
}).mount('#app');
