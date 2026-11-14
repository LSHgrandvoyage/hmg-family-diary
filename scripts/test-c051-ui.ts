import {chromium,expect} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import {join,extname} from 'node:path';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
const origin='https://c051.test',errors:string[]=[];
await mkdir('test-results/c051',{recursive:true});
const rows=[0,1].map(i=>({id:`synthetic-${i}.wav`,saved:true,audio_ready:true,draft_current:true,revision:1,photos:[],snapshot:{recorded_at:`2099-11-${14-i}T00:00:00Z`,text:'합성 이야기',speaker:'합성 가족',duration_ms:90000,draft:JSON.stringify({groups:[{label:`합성 여행 ${i}`,statements:[{text:'합성 가족의 여행 기록입니다.'}]}]})}}));
try {
 for(const theme of ['light','dark']) for(const native of [true,false]) {
  const p=await browser.newPage({viewport:native?{width:1280,height:720}:{width:390,height:844}});
  p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(({theme,native,rows})=>{
   const w=window as any;w.__name=(x:any)=>x;w.EventSource=undefined;w.animations=[];w.rows=rows;
   localStorage.setItem('chagok-theme-v1',theme);
   const animate=Element.prototype.animate;Element.prototype.animate=function(...args:any[]){w.animations.push(args);return animate.apply(this,args as any)};
   w.state={paired:true,driving:false,recording:false,can_record:true,theme_mode:theme,theme_dark:theme==='dark',
    driving_listen:{available:true,memory:rows[0].id,title:'합성 여행 0',date:'2099년 11월 14일',count:2,catalog_version:1,mode:'diary',browse_mode:'diary',playing:true,elapsed:7,sentence_count:4,sentence_current:2,sentences_done:1,duration_ms:90000}};
   if(native)w.NativeDiary={theme:()=>JSON.stringify(w.state),invoke:(raw:string)=>{
    const r=JSON.parse(raw);let result:any=w.state;
    if(r.cmd==='list')result={items:rows};
    if(r.cmd==='read'){w.lastRead=r.memoryId;result=rows.find(x=>x.id===r.memoryId);}
    if(r.cmd==='listenPage')result={items:rows.map((x,i)=>({id:x.id,title:`합성 여행 ${i}`,year:'2099',month_day:`11.${14-i}`,date:'2099년 11월',weekday:'합성 날짜'})),version:1,total:2};
    setTimeout(()=>w.NativeReply(r.id,result),r.cmd==='read'&&r.memoryId===rows[0].id?70:0);
   }};
  },{theme,native,rows});
  await p.route(origin+'/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/api/v1/sessions')return route.fulfill({json:{items:rows}});
   if(path==='/api/v1/devices')return route.fulfill({json:{devices:[]}});
   if(path==='/api/v1/sync')return route.fulfill({json:{items:[],cursor:'1',has_more:false}});
   if(path.startsWith('/api/v1/sessions/'))return route.fulfill({json:rows.find(x=>x.id===path.split('/')[4])});
   try {await route.fulfill({body:await readFile(join('apps/web/public',path)),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'} as any)[extname(path)]||'application/octet-stream'});}
   catch {await route.fulfill({status:404});}
  });
  await p.goto(origin+'/faithful/app.html#'+(native?'carhome':'main'));
  await expect(p.locator('[data-page]')).toHaveCSS('visibility','visible');
  expect(await p.evaluate(()=>(window as any).animations.length)).toBe(0);
  let count=0;
  const navigate=async(route:string,id?:string)=>{
   await p.evaluate(({route,id})=>{location.hash=route+(id?'?id='+encodeURIComponent(id):'')},{route,id});
   await expect(p.locator(`[data-page=${route}]`)).toHaveCSS('visibility','visible');
   await expect.poll(()=>p.evaluate(()=>(window as any).animations.length)).toBe(++count);
  };
  for(const route of native?['carlist','carsettings','recording','carhome']:['connect','main'])await navigate(route);
  const detail=native?'cardetail':'detail';await navigate(detail,rows[0].id);
  await expect(p.getByText('합성 가족의 여행 기록입니다.',{exact:true})).toBeVisible();
  await navigate(detail,rows[1].id); // Same route, different diary is a real transition.
  if(native){
   await p.evaluate(id=>{location.hash='cardetail?id='+id},rows[0].id);
   await expect.poll(()=>p.evaluate(()=>(window as any).lastRead)).toBe(rows[0].id);
   await p.evaluate(id=>{location.hash='cardetail?id='+id},rows[1].id);
   await expect(p.locator('[data-page=cardetail]')).toHaveCSS('visibility','visible');
   await p.waitForTimeout(100);
   expect(await p.evaluate(()=>location.hash)).toContain(rows[1].id);
   // Returning to the already displayed diary must not animate a stale intermediate response.
   expect(await p.evaluate(()=>(window as any).animations.length)).toBe(count);
  }
  await p.waitForTimeout(260);await expect(p.locator('[data-screen-transition]')).toHaveCount(0);
  if(native){
   await p.evaluate(()=>{const w=window as any;for(let i=0;i<4;i++)w.nativeStatus(w.state)});
   expect(await p.evaluate(()=>(window as any).animations.length)).toBe(count);
  }
  await p.emulateMedia({reducedMotion:'reduce'});
  await p.evaluate(route=>{location.hash=route},native?'carhome':'main');
  await expect(p.locator(`[data-page=${native?'carhome':'main'}]`)).toHaveCSS('visibility','visible');
  expect(await p.evaluate(()=>(window as any).animations.length)).toBe(count);
  await p.emulateMedia({reducedMotion:'no-preference'});
  if(native){
   await p.evaluate(()=>{const w=window as any;w.state.driving=true;w.state.tts_active=true;w.nativeStatus(w.state)});
   await expect(p.locator('[data-drive-stage=listening]')).toBeVisible();
   const bar=p.locator('[data-listen-progress]');
   await expect(bar).toBeVisible();await expect(bar).toHaveAttribute('aria-valuemax','4');await expect(bar).toHaveAttribute('aria-valuenow','1');
   await expect(p.locator('[data-listen-position]')).toHaveText('0:07');await expect(p.locator('[data-listen-duration]')).toHaveText('2 / 4 문장');
   expect(await bar.locator('span').evaluate((e:HTMLElement)=>e.style.width)).toBe('25%');
   await p.waitForTimeout(250);await p.screenshot({path:`test-results/c051/tts-${theme}.png`});
   await p.evaluate(()=>{const w=window as any;Object.assign(w.state.driving_listen,{elapsed:14,sentence_current:4,sentences_done:4,narration_complete:true,playing:false});w.state.tts_active=false;w.nativeStatus(w.state)});
   await expect(p.locator('[data-listen-position]')).toHaveText('0:14');await expect(p.locator('[data-listen-duration]')).toHaveText('낭독 완료');await expect(bar).toHaveAttribute('aria-valuenow','4');
   await p.evaluate(()=>{const w=window as any;Object.assign(w.state.driving_listen,{mode:'original',duration_ms:90000});w.state.position=20;w.nativeStatus(w.state)});
   await expect(p.locator('[data-listen-duration]')).toHaveText('1:30');await expect(bar).toHaveAttribute('aria-valuemax','90');await expect(bar).toHaveAttribute('aria-valuenow','20');
   await expect(p.locator('[data-page=carhome]')).toHaveCount(0);
  }
  await p.close();
 }
 expect(errors).toEqual([]);console.log('PASS C051: actual-state TTS clock/sentence progress/finish, original duration, vehicle/mobile route+diary transitions, stable refresh, reduced motion (synthetic).');
} finally {await browser.close();}
