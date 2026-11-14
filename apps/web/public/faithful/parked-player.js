(() => {
  const paths={repeat:'<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/>',pause:'<path d="M8 5v14M16 5v14"/>',play:'<path d="m8 5 11 7-11 7Z"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',previous:'<path d="M5 5v14M19 5 7 12l12 7Z"/>',next:'<path d="M19 5v14M5 5l12 7-12 7Z"/>'};
  const icon=name=>`<svg width="26" height="26" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">${paths[name]}</svg>`;
  function render(root,state,api){
    const p=state.playback||{},listen=state.driving_listen||{};
    const active=!!p.active&&!state.recording&&!state.driving;
    root.classList.toggle('has-parked-playback',active);
    let bar=root.querySelector('.parked-player');
    if(!active){bar?.remove();return;}
    if(!bar){bar=document.createElement('section');bar.className='parked-player';bar.setAttribute('aria-label','현재 재생');
      bar.innerHTML='<div class="parked-player-info"><span data-player-mode></span><strong data-player-title></strong></div><div class="parked-player-modes" role="group" aria-label="듣기 방식"><button data-player-command="listenDiary" aria-label="일기 읽어주기">일기</button><button data-player-command="listenOriginal" aria-label="그날의 목소리">목소리</button></div><span data-player-time></span><div class="parked-player-actions"></div>';
      for(const [cmd,label,glyph]of [['listenPrevious','이전 일기','previous'],['listenToggle','재생','play'],['listenNext','다음 일기','next'],['listenAutoplay','전체 반복 켜기','repeat'],['listenExit','재생 종료','close']]){
        const b=document.createElement('button');b.type='button';b.dataset.playerCommand=cmd;b.setAttribute('aria-label',label);b.innerHTML=icon(glyph);bar.lastElementChild.append(b);
      }
      bar.querySelectorAll('button').forEach(b=>api.action(b,()=>api.command(({listenDiary:"listenSwitchDiary",listenOriginal:"listenSwitchOriginal"})[b.dataset.playerCommand]||b.dataset.playerCommand)));
      root.append(bar);
    }
    const original=p.mode==='original',browseOriginal=original,waiting=p.settling||p.preparing||state.stt_busy||state.capture_finalizing||state.syncing,eligible=p.memory===listen.memory;
    bar.querySelector('[data-player-mode]').textContent=(original?'목소리':'일기')+' · '+(p.settling?'전환 중':p.preparing?'준비 중':p.playing?'재생 중':p.paused?'일시정지':'재생 대기');
    bar.querySelector('[data-player-title]').textContent=p.title||'그날의 일기';
    bar.querySelector('[data-player-time]').textContent=api.stamp(p.position||0)+(original&&p.duration>0?' / '+api.stamp(p.duration):'');
    for(const [cmd,enabled]of [['listenPrevious',listen.previous],['listenNext',listen.next]])bar.querySelector(`[data-player-command="${cmd}"]`).disabled=!enabled||waiting||!eligible;
    const toggle=bar.querySelector('[data-player-command="listenToggle"]');toggle.disabled=!!waiting;
    const label=original?(p.playing?'원본 일시정지':'원본 이어 듣기'):(p.playing?'일기 일시정지':'일기 이어 듣기');
    if(toggle.getAttribute('aria-label')!==label){toggle.setAttribute('aria-label',label);toggle.innerHTML=icon(p.playing?'pause':'play');}
    toggle.title=original?label:'일기는 멈춘 문장부터 이어 읽어요';
    for(const [cmd,on]of [['listenDiary',!browseOriginal],['listenOriginal',browseOriginal]]){const b=bar.querySelector(`[data-player-command="${cmd}"]`);b.setAttribute('aria-pressed',String(on));b.disabled=!!waiting||!eligible;}
    const autoplay=bar.querySelector('[data-player-command="listenAutoplay"]');
    autoplay.setAttribute('aria-pressed',String(!!listen.auto_advance));autoplay.setAttribute('aria-label',listen.auto_advance?'전체 반복 끄기':'전체 반복 켜기');autoplay.title=autoplay.getAttribute('aria-label');autoplay.disabled=!!waiting||!eligible;
    bar.querySelector('[data-player-command="listenExit"]').disabled=false;
  }
  window.DiaryParkedPlayer={render};
})();
