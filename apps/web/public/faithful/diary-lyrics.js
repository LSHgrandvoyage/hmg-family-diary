/* Only the native TTS window reaches this renderer; no whole-diary scrolling or text seeking. */
(() => {
  let root,memory,current=-1,signature='',observer;
  function layout(animate=false) {
    if(!root?.isConnected||root.hidden)return;
    const rows=[...root.querySelectorAll('[data-lyric-index]')];
    const active=rows.find(n=>Number(n.dataset.lyricIndex)===current);
    if(!active)return;
    const height=root.clientHeight,gap=8;
    active.style.fontSize='28px';
    // Keep even a long SDK utterance readable in full; surrounding sentences are previews.
    const room=Math.max(80,height-124);
    for(let size=28;size>18 && active.offsetHeight>room;size--)active.style.fontSize=`${size-1}px`;
    const tops=new Map([[current,(height-active.offsetHeight)/2]]);
    let top=tops.get(current);
    for(const n of rows.filter(n=>Number(n.dataset.lyricIndex)<current).reverse()) {
      top-=n.offsetHeight+gap;tops.set(Number(n.dataset.lyricIndex),top);
    }
    top=tops.get(current)+active.offsetHeight+gap;
    for(const n of rows.filter(n=>Number(n.dataset.lyricIndex)>current)) {
      tops.set(Number(n.dataset.lyricIndex),top);top+=n.offsetHeight+gap;
    }
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    for(const n of rows) {
      const target=tops.get(Number(n.dataset.lyricIndex))||0;
      const fresh=n.dataset.fresh==='true';delete n.dataset.fresh;
      if(!animate||reduced)n.style.transition='none';else n.style.removeProperty('transition');
      n.style.transform=`translateY(${target}px)`;
      if(fresh&&animate&&!reduced)n.animate([{opacity:0,transform:`translateY(${target+20}px)`},{opacity:getComputedStyle(n).opacity,transform:`translateY(${target}px)`}],{duration:320,easing:'cubic-bezier(.2,.75,.25,1)'});
    }
  }
  function render(target,state) {
    if(root!==target){observer?.disconnect();root=target;memory=null;current=-1;signature='';observer=new ResizeObserver(()=>layout(false));observer.observe(root);}
    const index=Number.isInteger(state?.lyrics_current)?state.lyrics_current:-1;
    const lines=(state?.lyrics||[]).filter(x=>Number.isInteger(x.index)&&Math.abs(x.index-index)<=2&&typeof x.text==='string').slice(0,5).sort((a,b)=>a.index-b.index);
    const key=JSON.stringify([state?.memory,index,lines]);
    if(key===signature)return;
    signature=key;
    const sameMemory=memory===state?.memory,forward=index>=current;
    const animate=sameMemory&&forward&&current>=0;
    if(!sameMemory||!forward)root.replaceChildren();
    memory=state?.memory;current=index;
    const keep=new Set(lines.map(x=>String(x.index)));
    for(const n of [...root.children])if(!keep.has(n.dataset.lyricIndex))n.remove();
    if(!lines.length){
      root.replaceChildren();
      if(state){const empty=document.createElement('p');empty.className='lyrics-empty';empty.textContent=state.preparing?'일기를 준비하고 있어요':'일기를 재생하면 문장이 여기에 나타나요';root.append(empty);}
      return;
    }
    for(const line of lines) {
      let n=root.querySelector(`[data-lyric-index="${line.index}"]`);
      if(!n){n=document.createElement('p');n.dataset.lyricIndex=String(line.index);n.dataset.fresh='true';n.className='lyric-line';root.append(n);}
      // Enable fading before changing emphasis; measuring after a disabled transition would snap opacity.
      if(animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches)n.style.removeProperty('transition');else n.style.transition='none';
      n.textContent=line.text;n.dataset.distance=String(Math.abs(line.index-index));n.dataset.side=line.index<index?'before':line.index>index?'after':'current';
      n.setAttribute('aria-current',String(line.index===index));n.setAttribute('aria-hidden',String(line.index!==index));
      if(line.index!==index)n.style.removeProperty('font-size');
    }
    // Forward windows are already ordered. Re-appending retained nodes would cancel their CSS transitions.
    layout(animate);
  }
  window.DiaryLyrics={render};
})();
