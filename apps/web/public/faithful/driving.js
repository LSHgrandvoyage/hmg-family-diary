/* C043: state-driven surfaces matching the user's four driving references. */
(() => {
  const svg = (body, cls = '') => `<svg class="${cls}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const icons = {
    repeat: svg('<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/>'),
    mic: svg('<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3"/>'),
    wheel: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="m4 8 6 3m10-3-6 3m-2 3v7"/>'),
    play: svg('<path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none"/>'),
    pause: svg('<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>'),
    stop: svg('<rect x="5" y="5" width="14" height="14" rx="3" fill="currentColor" stroke="none"/>'),
    previous: svg('<path d="M6 5v14M19 5 8 12l11 7Z" fill="currentColor"/>'),
    next: svg('<path d="M18 5v14M5 5l11 7-11 7Z" fill="currentColor"/>'),
    speaker: svg('<path d="M11 5 6 9H3v6h3l5 4ZM15 8a6 6 0 0 1 0 8"/>'),
  };
  let root, handlers, stage, latest = {}, listenView = false, previousAudio = false, finishRequested = false;
  const q = (s) => root.querySelector(s);
  const put = (s, value) => { const node = q(s); if (node) node.textContent = value ?? ''; };
  const bind = (selector, action) => handlers.action(q(selector), action);
  const mediaActive = (s) => !!(s.tts_active || s.audio_memory || s.playing);
  function header() {
    return `<header class="drive-header"><div class="drive-brand"><img src="brand/chagok-logo.svg" width="44" height="44" alt=""><strong>차곡차곡</strong></div><span class="drive-mode">${icons.wheel}주행 중 모드</span><span class="drive-connection" data-drive-connection></span><button class="drive-return" data-drive-return>${icons.mic}녹음하러 가기</button></header>`;
  }
  function showStage(next) {
    if (stage === next) return;
    stage = next;
    root.dataset.driveStage = stage;
    const body = q('.drive-stage');
    if (stage === 'idle') {
      body.innerHTML = `<div class="drive-idle-grid"><button class="drive-start-tile" data-drive-primary><span>${icons.mic}</span><strong>녹음 시작</strong></button><button class="drive-listen-tile" data-open-listen><span>${icons.play}</span><strong>일기 듣기</strong><small data-diary-count></small></button></div><p class="drive-idle-note">${icons.speaker}일기 본문과 사진은 차를 세운 뒤에 열립니다</p>`;
      bind('[data-drive-primary]', () => handlers.drive('record'));
      bind('[data-open-listen]', async () => {
        listenView = true;
        render(root, latest, handlers);
        if (!mediaActive(latest)) await handlers.drive('listenToggle');
      });
    } else if (stage === 'processing') {
      body.innerHTML='<section class="drive-processing" role="status" aria-live="polite" aria-busy="true"><span class="processing-spinner" aria-hidden="true"></span><h1 data-processing-title></h1><p data-processing-detail></p><span>이야기 확인은 주차 후에 할 수 있어요</span></section>';
    } else if (stage === 'recording') {
      body.innerHTML = `<section class="drive-record-card"><div class="drive-record-info"><span class="drive-record-state" data-record-state></span><div class="drive-timer" data-timer></div></div><div class="drive-record-audio"><div class="drive-input-wave" data-input-wave data-amplitude="152" role="img"></div><div class="drive-transcription"><span data-drive-stt-status role="status"></span><p data-driving-transcript></p></div></div></section><div class="drive-record-actions"><button data-drive-primary></button><button class="drive-finish" data-drive="finish">${icons.stop}<span>녹음 마치기</span></button></div>`;
      handlers.resetWave(q('[data-input-wave]'), 16);
      bind('[data-drive-primary]', () => handlers.drive('pause'));
      bind('[data-drive="finish"]', async () => {
        if(finishRequested)return;
        finishRequested=true;render(root,latest,handlers);
        try {await handlers.drive('finish');}
        catch(e){finishRequested=false;render(root,latest,handlers);throw e;}
      });
    } else {
      body.innerHTML = `<section class="drive-current"><div class="drive-memory-head"><span data-listen-date></span><button class="drive-autoplay" data-drive="listenAutoplay" aria-label="전체 반복 켜기" aria-pressed="false">${icons.repeat}</button></div><h1 data-listen-title></h1><span class="drive-active-mode" data-listen-active-mode></span><div class="drive-progress"><div class="drive-progress-track" role="progressbar" aria-label="원본 재생 진행" data-listen-progress><span></span><i data-current-sentence></i></div><div class="drive-times"><span data-listen-position></span><span data-listen-duration></span></div></div><div class="drive-transport"><button data-drive="listenPrevious" aria-label="이전 일기">${icons.previous}</button><button data-drive="listenToggle">${icons.play}</button><button data-drive="listenNext" aria-label="다음 일기">${icons.next}</button></div></section><aside class="drive-listen-side"><div class="drive-listen-tabs" role="group" aria-label="듣기 방식"><button data-drive="listenDiary">일기 읽어주기</button><button data-drive="listenOriginal">그날의 목소리</button></div><section class="drive-up-next"><h2>지난 일기 <span data-list-total></span></h2><div data-listen-upcoming role="region" aria-label="최근순 일기 목록" tabindex="0"></div></section></aside>`;
      body.querySelectorAll('[data-drive]').forEach(b => handlers.action(b, () => handlers.drive(b.dataset.drive)));
    }
  }
  function render(target, state, api) {
    if (root !== target) {
      root = target; handlers = api; stage = null; latest = state;
      listenView = mediaActive(state); previousAudio = mediaActive(state); finishRequested = false;
      root.className = 'driving-screen';
      root.innerHTML = header() + '<main class="drive-stage"></main><p class="drive-notice" data-driving-status role="status" hidden></p>';
      bind('[data-drive-return]', async () => {
        await handlers.drive('listenExit');
        listenView = false;
        render(root, latest, handlers);
      });
    }
    latest = state;
    if (mediaActive(state) && !previousAudio) listenView = true;
    previousAudio = mediaActive(state);
    if (state.recording) listenView = false;
    const listen = state.driving_listen || {};
    if(state.capture_finalizing || !state.recording)finishRequested=false;
    const processing=finishRequested || state.capture_finalizing || !state.recording && state.stt_busy;
    showStage(processing ? 'processing' : state.recording ? 'recording' : listenView ? 'listening' : 'idle');
    q('[data-drive-return]').hidden = stage !== 'listening';
    handlers.paintConnection(q('[data-drive-connection]'),!!state.paired);
    if (stage === 'idle') {
      q('[data-drive-primary]').disabled = !state.can_record;
      q('[data-open-listen]').disabled = !listen.available;
      put('[data-diary-count]', listen.count ? `지난 일기 ${listen.count}개` : '아직 완성된 일기가 없어요');
    } else if (stage === 'processing') {
      put('[data-processing-title]',state.recording?'원본 녹음을 보관하고 있어요':'이야기를 글로 마무리하고 있어요');
      put('[data-processing-detail]',state.recording?'녹음 종료를 처리하고 있어요':'원본은 보관했어요. 음성 인식이 끝날 때까지 잠시 기다려 주세요');
    } else if (stage === 'recording') {
      root.dataset.paused = String(!!state.paused);
      put('[data-timer]', handlers.stamp(state.elapsed || 0));
      q('[data-record-state]').innerHTML = state.paused ? icons.pause + '<span>멈춤 · 녹음되지 않는 중</span>' : '<i></i><span>녹음 중</span>';
      const primary = q('[data-drive-primary]');
      const label = state.paused ? '이어서 녹음' : '잠깐 멈춤';
      if (primary.getAttribute('aria-label') !== label) {
        primary.innerHTML = (state.paused ? icons.mic : icons.pause) + `<span>${label}</span>`;
        primary.setAttribute('aria-label', label);
      }
      handlers.drawWave(state.level, state.paused);
      const transcript = (state.driving_transcript || "").trim();
      window.DiaryLiveCaption.render(q('[data-driving-transcript]'),transcript);
      const speechState = state.paused ? '음성 인식 일시정지' : /실패|지연|오류|연결/.test(state.stt_status || '') ? '음성 인식을 확인하고 있어요 · 원본은 녹음 중' : transcript ? '실시간 음성 인식 중' : '목소리를 기다리고 있어요';
      if (q('[data-drive-stt-status]').textContent !== speechState) put('[data-drive-stt-status]', speechState);
    } else {
      const original = listen.mode === 'original', browseOriginal=listen.browse_mode==='original';
      put('[data-listen-active-mode]',original?'그날의 목소리':'일기 읽어주기');
      const autoplay=q('[data-drive="listenAutoplay"]');autoplay.setAttribute('aria-pressed',String(!!listen.auto_advance));autoplay.setAttribute('aria-label',listen.auto_advance?'전체 반복 끄기':'전체 반복 켜기');autoplay.title=autoplay.getAttribute('aria-label');autoplay.disabled=!listen.available;
      put('[data-listen-date]', listen.date || '완성된 일기가 없어요');
      put('[data-listen-title]', listen.title || '듣고 싶은 일기를 남겨 보세요');
      const progress = q('[data-listen-progress]');
      const duration = Math.max(0, (listen.duration_ms || 0) / 1000);
      const position = original ? Math.min(duration, Math.max(0, state.position || 0)) : Math.max(0, listen.elapsed || 0);
      const count=Math.max(0,listen.sentence_count||0),current=Math.min(count,Math.max(0,listen.sentence_current||0));
      const done=Math.min(count,Math.max(0,listen.sentences_done||0));
      progress.hidden=original?!duration:!count;
      progress.setAttribute('aria-label',original?'원본 재생 진행':'일기 문장 완료 진행');
      progress.setAttribute('aria-valuemin','0');progress.setAttribute('aria-valuemax',String(original?duration:count));
      progress.setAttribute('aria-valuenow',String(original?position:done));
      progress.setAttribute('aria-valuetext',original?`${handlers.stamp(position)} / ${handlers.stamp(duration)}`:`${count}문장 중 ${done}문장 완료`);
      progress.querySelector('span').style.width=`${original?(duration?100*position/duration:0):(count?100*done/count:0)}%`;
      const currentSegment=q('[data-current-sentence]');
      currentSegment.hidden=original||!current||listen.narration_complete;
      currentSegment.style.left=`${count?100*(current-1)/count:0}%`;currentSegment.style.width=`${count?100/count:0}%`;
      put('[data-listen-position]',handlers.stamp(position));
      put('[data-listen-duration]',original?handlers.stamp(duration):listen.narration_complete?'낭독 완료':count?`${current} / ${count} 문장`:listen.preparing?'낭독 준비 중':'일기 읽어주기');
      q('.drive-progress').dataset.original = String(original);
      for (const mode of ['Diary','Original']) {
        const button = q(`[data-drive="listen${mode}"]`);
        button.setAttribute('aria-pressed', String((mode === 'Original') === browseOriginal));
        button.disabled = !listen.available;
        button.setAttribute('aria-label', mode === 'Original' ? '원본 목소리 목록 선택' : '일기 읽어주기 목록 선택');
      }
      q('[data-drive="listenPrevious"]').disabled = !listen.available || !listen.previous || listen.preparing;
      q('[data-drive="listenNext"]').disabled = !listen.available || !listen.next || listen.preparing;
      const toggle = q('[data-drive="listenToggle"]');
      toggle.disabled = !listen.available || !!listen.preparing;
      const playing = !!listen.playing;
      const label = original ? playing ? '원본 일시정지' : '원본 재생' : playing ? '일기 일시정지' : '일기 재생';
      if (toggle.getAttribute('aria-label') !== label) {
        toggle.innerHTML = icons[playing ? 'pause' : 'play']; toggle.setAttribute('aria-label', label);
      }
      toggle.title = !original ? '일기는 멈춘 문장부터 이어 읽어요' : label;
      put('[data-list-total]',listen.count?`${listen.count}개`:'');
      window.DiaryListenList.render(q('[data-listen-upcoming]'),listen,{
        action:handlers.action,page:handlers.page,select:handlers.select,
      });
    }
    const notice = state.playback_notice || '';
    const error = /실패|못했|오류|상실|중단/.test(notice) ? notice : '';
    put('[data-driving-status]',stage==='processing'?'':error);
    q('[data-driving-status]').hidden = !q('[data-driving-status]').textContent;
  }
  window.DiaryDriving = { render };
})();
