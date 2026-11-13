(() => {
  const icons = {
    pause:'<path d="M8 5v14M16 5v14"/>',
    play:'<path d="m8 5 11 7-11 7Z"/>',
    stop:'<rect x="5" y="5" width="14" height="14" rx="2"/>',
    previous:'<path d="M5 5v14M19 5 7 12l12 7Z"/>',
    next:'<path d="M19 5v14M5 5l12 7-12 7Z"/>',
  };
  const icon = name => `<svg width="26" height="26" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">${icons[name]}</svg>`;
  function render(root,state,api) {
    const playback = state.playback || {};
    const active = !!playback.active && !state.recording && !state.driving;
    root.classList.toggle('has-parked-playback',active);
    let bar = root.querySelector('.parked-player');
    if (!active) { bar?.remove(); return; }
    if (!bar) {
      bar=document.createElement('section');bar.className='parked-player';bar.setAttribute('aria-label','현재 재생');
      bar.innerHTML='<div class="parked-player-info"><span data-player-mode></span><strong data-player-title></strong></div><span data-player-time></span><div class="parked-player-actions"></div>';
      root.append(bar);
      for (const [cmd, label, glyph] of [['ttsPrevious','이전 일기','previous'],['togglePlayback','원본 일시정지','pause'],['stopPlayback','재생 종료','stop'],['ttsNext','다음 일기','next']]) {
        const b=document.createElement('button');b.type='button';b.dataset.playerCommand=cmd;b.setAttribute('aria-label',label);b.innerHTML=icon(glyph);
        api.action(b,()=>api.command(cmd));bar.lastElementChild.append(b);
      }
    }
    const original=playback.mode==='original';
    bar.querySelector('[data-player-mode]').textContent=playback.settling?'재생 종료 중':original?playback.playing?'그날의 목소리 · 재생 중':'그날의 목소리 · 일시정지':playback.playing?'일기 낭독 · 재생 중':'일기 낭독 · 준비 중';
    bar.querySelector('[data-player-title]').textContent=playback.title || '그날의 일기';
    bar.querySelector('[data-player-time]').textContent=api.stamp(playback.position||0)+(original && playback.duration>0?' / '+api.stamp(playback.duration):'');
    for (const [cmd, enabled] of [['ttsPrevious',state.tts_previous],['ttsNext',state.tts_next]]) {
      const button=bar.querySelector(`[data-player-command="${cmd}"]`);button.hidden=original;button.disabled=!enabled||playback.settling;
    }
    const toggle=bar.querySelector('[data-player-command="togglePlayback"]');toggle.hidden=!original;toggle.disabled=!!playback.settling;
    const label=playback.playing?'원본 일시정지':'원본 이어 듣기';
    if (toggle.getAttribute('aria-label')!==label) {toggle.setAttribute('aria-label',label);toggle.innerHTML=icon(playback.playing?'pause':'play');}
    bar.querySelector('[data-player-command="stopPlayback"]').disabled=!!playback.settling;
  }
  window.DiaryParkedPlayer={render};
})();
