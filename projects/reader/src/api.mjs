export function createReaderApi({bridge,fetchImpl=globalThis.fetch,timeoutMs=15_000}={}){
  async function call(route,options){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetchImpl('/api/'+route,{...options,signal:controller.signal});
      const body=await response.json();
      if(!response.ok||!body.ok)throw Error(body.error||'操作未完成，请重试。');
      return body.data;
    }catch(error){
      if(error.name==='AbortError')throw Error('连接超时，请确认预览服务正在运行后重试。');
      throw error;
    }finally{clearTimeout(timer);}
  }
  const post=(route,value)=>call(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
  if(bridge){
    const methods=['list','open','read','progress','remove','readPreferences','updatePreferences'];
    return Object.fromEntries(methods.map(name=>[name,async(...args)=>{
      if(typeof bridge[name]!=='function')throw Error('桌面接口版本不一致，请退出后重新打开最新版阅读器。');
      const result=await bridge[name](...args);
      if(!result?.ok)throw Error(result?.error||'操作未完成，请重试。');
      return result.data;
    }]));
  }
  return {
    list:()=>call('books'),read:id=>call('book?id='+encodeURIComponent(id)),
    progress:(id,position)=>post('progress',{id,position}),remove:id=>post('remove',{id}),
    readPreferences:()=>call('preferences'),updatePreferences:value=>post('preferences',value),
    importFile:file=>call('import?name='+encodeURIComponent(file.name),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file})
  };
}
