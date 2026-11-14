import { chromium, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const origin='https://c050.test';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
await mkdir('test-results/c050',{recursive:true});
const errors:string[]=[];
try {
 for(const theme of ['light','dark']) {
  const p=await browser.newPage({viewport:{width:1280,height:720},hasTouch:true});
  p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(({theme})=>{
   const w=window as any;w.__name=(x:any)=>x;w.EventSource=undefined;w.calls=[];w.animations=[];w.held=[];
   localStorage.setItem('chagok-theme-v1',theme);
   const animate=Element.prototype.animate;
   Element.prototype.animate=function(...args:any[]){w.animations.push(args);return animate.apply(this,args as any)};
   w.rows=[{id:'synthetic-a.wav',year:'2099',month_day:'11.14',weekday:'토요일',date:'2099년 11월 14일 토요일',title:'합성 가족의 바닷길'},
    {id:'synthetic-b.wav',year:'2098',month_day:'12.31',weekday:'수요일',date:'2098년 12월 31일 수요일',title:'합성 가족의 연말 나들이'}];
   w.state={paired:true,driving:false,recording:false,can_record:true,theme_mode:theme,theme_dark:theme==='dark',
    driving_listen:{available:true,memory:w.rows[0].id,title:w.rows[0].title,date:w.rows[0].date,count:2,catalog_version:1,mode:'diary',browse_mode:'diary',playing:false,next:true}};
   w.publish=(patch:any)=>{Object.assign(w.state,patch);w.nativeStatus(w.state)};
   w.NativeDiary={theme:()=>JSON.stringify(w.state),invoke:(raw:string)=>{
    const r=JSON.parse(raw);w.calls.push(r);let value:any=w.state;
    if(r.cmd==='list')value={items:[]};
    if(r.cmd==='listenPage')value={items:w.rows,before:false,after:false,total:2,version:1};
    if(r.action==='finish'){w.held.push(()=>w.NativeReply(r.id,w.state));return;}
    if(r.action==='listenToggle'&&w.holdListen){w.held.push(()=>w.NativeReply(r.id,w.state));return;}
    if(r.action==='listenExit'){w.state.tts_active=false;w.state.playback={active:false};}
    setTimeout(()=>w.NativeReply(r.id,value),0);
   }};
  },{theme});
  await p.route(origin+'/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   try {await route.fulfill({body:await readFile(join('apps/web/public',path)),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'} as any)[extname(path)]||'application/octet-stream'});}
   catch {await route.fulfill({status:404});}
  });
  await p.goto(origin+'/faithful/app.html#carhome');
  const badge=p.locator('[data-sync-state]');await expect(badge).toHaveText('연결 중');
  const colors=await badge.evaluate(e=>({bg:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color}));
  expect(colors.bg).not.toBe('rgba(0, 0, 0, 0)');
  const button=p.locator('[data-page=carhome] button').first();
  expect(await button.evaluate(e=>getComputedStyle(e).getPropertyValue('-webkit-tap-highlight-color'))).toBe('rgba(0, 0, 0, 0)');
  await p.keyboard.press('Tab');
  expect(await p.evaluate(()=>document.activeElement?.matches(':focus-visible'))).toBe(true);
  expect(await p.evaluate(()=>getComputedStyle(document.activeElement!).outlineStyle)).not.toBe('none');
  await p.evaluate(()=>{const w=window as any;w.publish({playback:{active:true,memory:w.rows[0].id,mode:'diary',title:w.rows[0].title,settling:true}})});
  await expect(p.locator('[data-player-command=listenToggle]')).toBeDisabled();
  await expect(p.locator('[data-player-command=listenExit]')).toBeEnabled();
  await p.evaluate(()=>{const w=window as any;w.state.driving_listen.available=false;w.state.playback.settling=false;w.publish({})});
  // An unfinished original may have no completed-diary catalog entry, yet must remain controllable.
  await expect(p.locator('[data-player-command=listenToggle]')).toBeEnabled();
  await p.evaluate(()=>{const w=window as any;w.state.driving_listen.available=true;w.publish({})});
  await p.evaluate(()=>(window as any).publish({playback:{active:false}}));
  await p.evaluate(()=>(window as any).publish({driving:true}));
  await expect(p.locator('[data-drive-stage=idle]')).toBeVisible();
  await expect.poll(()=>p.evaluate(()=>(window as any).animations.length)).toBe(1);
  expect(await p.evaluate(()=>(window as any).animations[0][1].duration)).toBe(220);
  expect(await p.locator('[data-drive-connection]').evaluate(e=>({bg:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color}))).toEqual(colors);
  await expect(p.locator('[data-drive-connection] [data-connection-icon=phone]')).toHaveCount(1);
  await expect(p.locator('[data-page=carhome]')).toHaveCount(0);
  await p.evaluate(()=>{const w=window as any;for(let i=0;i<5;i++)w.publish({elapsed:i})});
  expect(await p.evaluate(()=>(window as any).animations.length)).toBe(1);
  await p.waitForTimeout(250);await expect(p.locator('[data-mode-transition]')).toHaveCount(0);
  await p.evaluate(()=>(window as any).publish({recording:true,can_record:false,driving_transcript:'합성으로 만든 인식문입니다.',level:.4}));
  await p.locator('[data-drive=finish]').click();
  await expect(p.locator('[data-drive-stage=processing]')).toBeVisible();
  await expect(p.locator('.drive-processing')).toHaveAttribute('aria-busy','true');
  await expect(p.locator('[data-open-listen]')).toHaveCount(0);
  await p.evaluate(()=>{const w=window as any;w.publish({recording:false,capture_finalizing:true,stt_busy:true});w.held.splice(0).forEach((f:any)=>f())});
  await expect(p.locator('[data-processing-title]')).toHaveText('이야기를 글로 마무리하고 있어요');
  await p.screenshot({path:`test-results/c050/processing-${theme}.png`});
  await p.evaluate(()=>(window as any).publish({capture_finalizing:false,stt_busy:false,can_record:true}));
  await expect(p.locator('[data-drive-stage=idle]')).toBeVisible();
  await expect(p.locator('[data-drive-primary]')).toBeEnabled();
  await p.evaluate(()=>{const w=window as any;w.publish({tts_active:true,playback:{active:true,memory:w.rows[0].id,mode:'diary',title:w.rows[0].title,playing:false}})});
  await expect(p.locator('[data-drive-stage=listening]')).toBeVisible();
  await expect(p.locator('[data-listen-rows] [data-memory]')).toHaveCount(1);
  await expect(p.locator('[data-listen-pinned] [data-date-year]')).toHaveText('2099');
  await expect(p.locator('[data-listen-rows] [data-date-year]')).toHaveText('2098');
  await expect(p.locator('[data-listen-rows] [data-date-calendar]')).toHaveText('12.31');
  await expect(p.locator('[data-listen-rows] [data-memory]')).toHaveAttribute('aria-label','2098년 12월 31일 수요일 · 합성 가족의 연말 나들이');
  await expect(p.locator('[data-drive-connection]')).toBeVisible();
  await p.screenshot({path:`test-results/c050/listening-${theme}.png`});
  await p.evaluate(()=>{const w=window as any;w.state.driving_listen.available=false;w.publish({})});
  await expect(p.locator('[data-listen-pinned] [data-memory]')).toBeDisabled();
  await expect(p.locator('[data-drive=listenNext]')).toBeDisabled();
  await p.evaluate(()=>{const w=window as any;w.state.driving_listen.available=true;w.holdListen=true;w.calls=[];w.publish({})});
  await p.locator('[data-drive=listenToggle]').click();
  await expect(p.locator('body')).toHaveAttribute('data-listen-pending','true');
  // DOM click bypasses pointer suppression; the request gate must still reject duplicates.
  await p.locator('[data-drive=listenToggle]').evaluate((e:HTMLElement)=>e.click());
  expect(await p.evaluate(()=>(window as any).calls.filter((r:any)=>r.action==='listenToggle').length)).toBe(1);
  await p.locator('[data-drive-return]').click();
  await expect.poll(()=>p.evaluate(()=>(window as any).calls.some((r:any)=>r.action==='listenExit'))).toBe(true);
  await p.evaluate(()=>{const w=window as any;w.held.splice(0).forEach((f:any)=>f());w.holdListen=false});
  await expect(p.locator('body')).not.toHaveAttribute('data-listen-pending','true');
  await p.evaluate(()=>{const w=window as any;w.publish({driving:false});w.restoreNativeView('carsettings',null)});
  await expect(p.locator('[data-page=carsettings]')).toBeVisible();
  await expect.poll(()=>p.evaluate(()=>(window as any).animations.length)).toBe(2);
  await p.emulateMedia({reducedMotion:'reduce'});
  await p.evaluate(()=>(window as any).publish({driving:true}));
  await expect(p.locator('[data-drive-stage=idle]')).toBeVisible();
  expect(await p.evaluate(()=>(window as any).animations.length)).toBe(2);
  await p.close();
 }
 expect(errors).toEqual([]);console.log('C050 light/dark touch, focus, connection, transitions, STT processing, dates, request gating: PASS (synthetic bridge)');
} finally {await browser.close();}
