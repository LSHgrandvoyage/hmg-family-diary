(() => {
  const inputs=[...document.querySelectorAll('[data-consent]')], all=document.querySelector('[data-consent-all]'), start=document.querySelector('[data-start]');
  let state={checks:[false,false,false],ready:!window.NativeEntry,waiting:false};
  function render(value) {
    state=value;
    inputs.forEach((e,i)=>{e.checked=!!state.checks[i];e.disabled=!!state.waiting;});
    all.checked=state.checks.every(Boolean);all.indeterminate=!all.checked&&state.checks.some(Boolean);all.disabled=!!state.waiting;
    start.disabled=!state.ready||state.waiting||!all.checked;
    document.querySelector('[data-readiness]').textContent=state.waiting?'차량 상태를 확인하고 있어요. 녹음은 자동으로 시작되지 않아요.':!state.ready?'녹음 기능을 준비하고 있어요.':'새로운 사람이 함께 탈 때는 녹음 전에 다시 알려 주세요.';
    if (state.theme) window.DiaryTheme?.native(state.theme);
  }
  function send(action) {
    if(window.NativeEntry) {window.NativeEntry.invoke(JSON.stringify(action));return;}
    if(action.cmd==='all')state.checks=state.checks.map(()=>action.checked);
    if(action.cmd==='toggle')state.checks[action.index]=action.checked;
    render(state); // A browser preview never starts a microphone or accesses family records.
  }
  all.addEventListener('change',()=>send({cmd:'all',checked:all.checked}));
  inputs.forEach((e,i)=>e.addEventListener('change',()=>send({cmd:'toggle',index:i,checked:e.checked})));
  start.addEventListener('click',()=>{if(!start.disabled)send({cmd:'start'});});
  const policy=document.querySelector('dialog');
  document.querySelector('[data-policy]').onclick=()=>policy.showModal();
  document.querySelector('[data-close]').onclick=()=>policy.close();
  window.updateWelcome=render;
  if(window.NativeEntry)render(JSON.parse(window.NativeEntry.state()));else render(state);
})();
