import { chromium, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { join,extname } from 'node:path';
const origin='https://c048.test';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
const errors:string[]=[];
await mkdir('test-results/c048',{recursive:true});
const fixtures=()=>['2099-12-03','2099-11-02','2099-10-01','2098-12-31'].map((d,i)=>({
  id:`synthetic-${i}.wav`,revision:1,deleted:false,audio_ready:true,saved:i!==3,draft_current:true,photos:[],
  snapshot:{recorded_at:d+'T00:00:00Z',speaker:'합성 가족',duration_ms:2000,text:'합성 이야기',draft:JSON.stringify({groups:[{label:`합성 기록 ${i}`,statements:[{text:'합성 본문'}]}]})}
}));
try {
 for(const theme of ['light','dark']) {
  let vehicleColors:any;
  for(const native of [true,false]) {
   const p=await browser.newPage({viewport:native?{width:1280,height:720}:{width:390,height:844},reducedMotion:'reduce'});
   p.on('pageerror',e=>errors.push(e.message));
   let rows:any[]=fixtures(),syncRows:any[]=structuredClone(rows),syncCount=0,failSync=false;
   let devices=[{id:'synthetic-car',label:'합성 차',expires_at:'2099-12-31T00:00:00Z',revoked_at:null}];
   await p.addInitScript(({native,theme,rows})=>{
    const w=window as any;w.__name=(x:any)=>x;w.rows=rows;w.streams=[];
    localStorage.setItem('chagok-theme-v1',theme);
    w.state={paired:true,driving:false,recording:false,can_record:true,sync_change_seq:7,
      sync_notice:'연결 대기 · 기록을 보관했어요. 연결되면 다시 보내요.',sync_pending:true,
      theme_mode:theme,theme_dark:theme==='dark',tts_active:true,
      playback:{active:true,memory:rows[0].id,title:'합성 기록 0',mode:'diary',playing:false,paused:true,position:4},
      driving_listen:{available:true,memory:rows[0].id,mode:'diary',index:0,count:4,previous:false,next:true,auto_advance:true}};
    if(native){
     w.EventSource=undefined;
     w.NativeDiary={theme:()=>JSON.stringify(w.state),invoke:(raw:string)=>{
      const r=JSON.parse(raw);let data:any=w.state;
      if(r.cmd==='list')data={items:w.rows};
      if(r.cmd==='read')data=w.rows.find((x:any)=>x.id===r.memoryId);
      setTimeout(()=>w.NativeReply(r.id,data),0);
     }};
    } else {
     w.EventSource=class {
      listeners:any={};onerror:any;closed=false;
      constructor(){w.streams.push(this)}
      addEventListener(name:string,cb:any){this.listeners[name]=cb}
      emit(name:string){this.listeners[name]?.({})}
      close(){this.closed=true}
     };
    }
   },{native,theme,rows});
   await p.route(origin+'/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname,method=route.request().method();
    if(path==='/api/v1/sync'){
     syncCount++;
     return route.fulfill(failSync?{status:503,json:{error:{code:'UNAVAILABLE'}}}:{json:{items:syncRows,cursor:String(syncCount),has_more:false}});
    }
    if(path==='/api/v1/devices')return route.fulfill({json:{devices}});
    if(path==='/api/v1/sessions')return route.fulfill({json:{items:rows}});
    const id=path.split('/')[4];
    if(path.startsWith('/api/v1/sessions/')&&path.endsWith('/photos')&&method==='POST') {
     const r=rows.find(x=>x.id===id);r.revision++;r.photos=[{id:'synthetic-photo',sha256:'a'.repeat(64)}];syncRows=[structuredClone(r)];
     return route.fulfill({status:201,json:{id:'synthetic-photo'}});
    }
    if(path.startsWith('/api/v1/sessions/')&&!path.includes('/photos/'))return route.fulfill({json:rows.find(x=>x.id===id)});
    if(path.includes('/photos/'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#aa8866"/></svg>'});
    try {await route.fulfill({body:await readFile(join('apps/web/public',path)),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'} as any)[extname(path)]||'application/octet-stream'});}
    catch {await route.fulfill({status:404});}
   });
   await p.goto(origin+'/faithful/app.html#'+(native?'carhome':'main'));
   const toast=p.locator('.sync-saved-notice');
   if(native) {
    const badge=p.locator('[data-sync-state]');
    await expect(badge).toHaveText('연결 중');await expect(badge.locator('[data-connection-icon=phone]')).toHaveCount(1);
    vehicleColors=await badge.evaluate(e=>({bg:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color}));
    await expect(p.locator('[data-home-count]')).toHaveText('전체 기록 4개');await expect(toast).toHaveCount(0);
    const bar=p.locator('.parked-player');
    await expect(bar.locator('[data-player-command=listenDiary]')).toHaveText('일기');
    await expect(bar.locator('[data-player-command=listenOriginal]')).toHaveText('목소리');
    await expect(bar.locator('[data-player-mode]')).toHaveText('일기 · 일시정지');
    for(const command of ['listenPrevious','listenToggle','listenNext','listenAutoplay']) {
     const b=bar.locator(`[data-player-command=${command}]`);
     expect((await b.textContent())?.trim()).toBe('');
     expect(await b.evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
     const rect=(await b.boundingBox())!;expect(rect.width).toBeGreaterThanOrEqual(48);expect(rect.height).toBeGreaterThanOrEqual(48);
    }
    await p.clock.install();
    await p.evaluate(()=>{const w=window as any;w.state.syncing=true;w.nativeStatus(w.state)});await expect(badge).toHaveText('연결 중');await expect(toast).toHaveCount(0);
    await p.evaluate(()=>{const w=window as any;w.state.sync_change_seq=8;w.nativeStatus(w.state)});await expect(toast).toHaveText('기록을 보관했어요.');
    await p.screenshot({path:`test-results/c048/car-home-${theme}.png`});
    await p.clock.runFor(3900);await p.evaluate(()=>(window as any).nativeStatus((window as any).state));await p.clock.runFor(200);await expect(toast).toHaveCount(0);
    await p.evaluate(()=>{const w=window as any;w.state.sync_change_seq=9;w.nativeStatus(w.state)});await expect(toast).toHaveCount(1);
    await p.evaluate(()=>{const w=window as any;w.state.recording=true;w.nativeStatus(w.state)});await expect(toast).toHaveCount(0);
    await p.evaluate(()=>{const w=window as any;w.state.sync_change_seq=10;w.nativeStatus(w.state)});await expect(toast).toHaveCount(0);
    await p.evaluate(()=>{const w=window as any;w.state.recording=false;w.nativeStatus(w.state)});await expect(toast).toHaveCount(0);
    await p.clock.resume();
    await p.evaluate(()=>(window as any).restoreNativeView('carlist',null));
    await expect(p.locator('[data-page=carlist]')).toBeVisible();await expect(p.locator('[data-sync-state]')).toHaveCount(0);
    await expect(p.getByText(/연결 대기 · 기록을 보관/)).toHaveCount(0);
    await p.screenshot({path:`test-results/c048/car-list-${theme}.png`});
   } else {
    const badge=p.locator('.mobile-library-header a');await expect(badge).toHaveText('연결 중');await expect(badge.locator('[data-connection-icon=phone]')).toHaveCount(1);
    expect(await badge.evaluate(e=>({bg:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color}))).toEqual(vehicleColors);
    await expect(toast).toHaveCount(0);
    async function event(name='changed') {
     const n=syncCount;await p.evaluate(name=>(window as any).streams.at(-1).emit(name),name);
     await expect.poll(()=>syncCount).toBeGreaterThan(n);await p.waitForTimeout(100);
    }
    await event('ready');await expect(toast).toHaveCount(0); // First cursor drain is a baseline.
    await event();await expect(toast).toHaveCount(0); // Replay is not a change.
    devices[0].label='합성 차 별명 변경';syncRows=[];await event();await expect(toast).toHaveCount(0);
    rows[0].revision=2;rows[0].snapshot.draft=JSON.stringify({groups:[{label:'새로 동기화된 합성 일기',statements:[{text:'합성 본문'}]}]});syncRows=[structuredClone(rows[0])];
    await event();await expect(toast).toHaveText('기록을 보관했어요.');await expect(p.getByText('새로 동기화된 합성 일기',{exact:true})).toBeVisible();
    await p.screenshot({path:`test-results/c048/mobile-${theme}.png`});
    await p.clock.install();await p.clock.runFor(4100);await expect(toast).toHaveCount(0);
    await event();await expect(toast).toHaveCount(0);
    failSync=true;await event();await expect(toast).toHaveCount(0);await expect(p.locator('#sync-connection-status')).toContainText('연결을 확인');failSync=false;
    await event('ready');await expect(toast).toHaveCount(0);
    await p.clock.resume();
    await p.getByText('새로 동기화된 합성 일기',{exact:true}).click();await expect(p.locator('.photo-add')).toBeVisible();
    const picker=p.waitForEvent('filechooser');await p.locator('.photo-add').click();
    await (await picker).setFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=','base64')});
    await expect(toast).toHaveText('기록을 보관했어요.');await expect(p.locator('.photo-toolbar')).toContainText('사진 1장');
    await p.clock.install();await p.clock.runFor(4100);await expect(toast).toHaveCount(0);
    await event();await expect(toast).toHaveCount(0); // The upload's own SSE is deduplicated.
   }
   await p.close();
  }
 }
 expect(errors).toEqual([]);
 console.log('PASS C048: registered connection/phone glyph, month/year mixed all-record count, no library status, compact bare player, native sequence feedback only once, mobile initial/replay/device-only/failure quiet, actual update and upload feedback with SSE dedup; both themes, synthetic bridge/API.');
} finally {await browser.close()}
