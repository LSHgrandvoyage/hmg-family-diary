/* A cursor window, independent of the 250ms media status updates. */
(() => {
  let mounted,api,state,items=[],version,older=false,newer=false,busy=false,error='',epoch=0,seenVersion,seenMemory;
  const renderRows=()=>{
    if(!mounted?.isConnected)return;
    const container=mounted;
    const active=state?.memory;
    container.setAttribute('aria-busy',String(busy));
    const list=container.querySelector('[data-listen-rows]');
    for(const row of list.children){row.setAttribute('aria-current',String(row.dataset.memory===active));row.dataset.playing=String(row.dataset.memory===active&&!!state.playing);}
    const status=container.querySelector('[data-listen-load-status]');
    status.textContent=error|| (busy?'일기 불러오는 중…':items.length?'':'아직 완성된 일기가 없어요');
    const retry=container.querySelector('[data-listen-retry]');retry.hidden=!error;retry.disabled=busy;
    container.querySelector('[data-listen-before]').hidden=!older;
    container.querySelector('[data-listen-after]').hidden=!newer;
    container.querySelectorAll('[data-load-direction]').forEach(b=>b.disabled=busy);
  };
  function rebuild(){
    const list=mounted.querySelector('[data-listen-rows]');
    const focused=list.contains(document.activeElement)?document.activeElement.dataset.memory:null;
    const existing=new Map([...list.children].map(n=>[n.dataset.memory,n]));
    const nodes=items.map(item=>{
      let b=existing.get(item.id);
      if(!b){b=document.createElement('button');b.type='button';b.className='drive-upcoming-card';b.dataset.memory=item.id;
        const day=document.createElement('span'),words=document.createElement('span'),title=document.createElement('strong'),date=document.createElement('span'),playing=document.createElement('span');
        day.className='drive-upcoming-day';words.className='drive-list-words';playing.className='drive-now';playing.textContent='듣는 중';
        day.textContent=item.day;title.textContent=item.title;date.textContent=item.date;words.append(title,date,playing);b.append(day,words);
        api.action(b,()=>api.select(item.id));
      }
      b.querySelector('.drive-upcoming-day').textContent=item.day;
      b.querySelector('strong').textContent=item.title;
      b.querySelector('.drive-list-words > span').textContent=item.date;
      return b;
    });
    list.replaceChildren(...nodes);if(focused)nodes.find(n=>n.dataset.memory===focused)?.focus({preventScroll:true});renderRows();
  }
  async function load(direction='around') {
    if(busy||!mounted?.isConnected)return;
    if(direction==='before'&&!older||direction==='after'&&!newer)return;
    const target=mounted,token=epoch,oldHeight=target.scrollHeight,oldTop=target.scrollTop;
    busy=true;error='';renderRows();
    try{
      const value=await api.page({direction,version,cursor:direction==='before'?items[0]?.id:direction==='after'?items.at(-1)?.id:state?.memory});
      if(token!==epoch||target!==mounted||!target.isConnected)return;
      if(value.error)throw Error(value.error);
      const received=value.items||[];
      const reset=direction==='around'||value.reset;
      const all=reset?received:direction==='before'?[...received,...items]:[...items,...received];
      items=[...new Map(all.map(x=>[x.id,x])).values()];version=value.version;
      if(reset){older=!!value.before;newer=!!value.after;}
      else if(direction==='before')older=!!value.before;else newer=!!value.after;
      rebuild();
      if(reset){const current=[...target.querySelectorAll('[data-memory]')].find(e=>e.dataset.memory===state.memory);if(current)target.scrollTop=current.offsetTop-target.offsetTop-target.clientHeight/2+current.clientHeight/2;}
      else if(direction==='before')target.scrollTop=oldTop+target.scrollHeight-oldHeight;
      else target.scrollTop=oldTop;
    }catch(e){if(token===epoch)error=e.message||'일기를 불러오지 못했어요.';}
    finally{if(token===epoch){busy=false;renderRows();}}
  }
  function render(container,listen,handlers){
    if(mounted!==container){mounted=container;api=handlers;state=listen;items=[];version=undefined;older=false;newer=false;busy=false;error='';epoch++;seenVersion=listen.catalog_version;seenMemory=listen.memory;
      container.innerHTML='<button data-listen-before data-load-direction="before" hidden>이전 일기 더 보기</button><div data-listen-rows></div><button data-listen-after data-load-direction="after" hidden>다음 일기 더 보기</button><p data-listen-load-status role="status"></p><button data-listen-retry hidden>다시 불러오기</button>';
      container.querySelectorAll('[data-load-direction]').forEach(b=>b.onclick=()=>load(b.dataset.loadDirection));
      container.querySelector('[data-listen-retry]').onclick=()=>load();
      container.addEventListener('scroll',()=>{if(busy||error)return;if(container.scrollTop<24&&older)void load('before');else if(container.scrollHeight-container.clientHeight-container.scrollTop<24&&newer)void load('after');},{passive:true});
      void load();return;
    }
    const invalidated=seenVersion!==listen.catalog_version || seenMemory!==listen.memory&&!items.some(x=>x.id===listen.memory);
    seenVersion=listen.catalog_version;seenMemory=listen.memory;
    state=listen;
    if(busy&&invalidated){epoch++;busy=false;error='';void load();return;}
    if(!busy && !error && version!==undefined && (version!==listen.catalog_version || listen.memory&&!items.some(x=>x.id===listen.memory))){epoch++;void load();}
    renderRows();
  }
  window.DiaryListenList={render};
})();
