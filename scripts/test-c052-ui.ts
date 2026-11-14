import {chromium,expect} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import {join,extname} from 'node:path';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
const origin='https://c052.test',errors:string[]=[];
await mkdir('test-results/c052',{recursive:true});
const words=['아침부터 아이들은 창밖을 바라보며 들떠 있었다.','익숙한 도로 끝에서 파란 바다가 모습을 드러냈다.','뒷좌석에서 터진 웃음이 파도 소리보다 더 크게 느껴졌다.','나는 그 웃음을 싣고 해안 도로를 천천히 달렸다.','돌아오는 길에는 모두가 조금씩 잠이 들었다.','오늘도 함께여서 오래 기억하고 싶은 하루였다.','다음 여행에서도 이 목소리를 다시 듣고 싶다.'];
try {for(const theme of ['light','dark']) {
 const p=await browser.newPage({viewport:{width:1280,height:720}});p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(({theme,words})=>{
  const w=window as any;w.__name=(x:any)=>x;w.EventSource=undefined;w.words=words;w.animationCount=0;
  const animate=Element.prototype.animate;Element.prototype.animate=function(...args:any[]){w.animationCount++;return animate.apply(this,args as any)};
  localStorage.setItem('chagok-theme-v1',theme);
  w.state={paired:true,driving:true,recording:false,can_record:false,theme_mode:theme,theme_dark:theme==='dark',tts_active:true,
   driving_listen:{available:true,memory:'synthetic-a.wav',title:'바다를 싣고 돌아온 날',date:'2099년 11월 14일',count:1,catalog_version:1,mode:'diary',browse_mode:'diary',playing:true,elapsed:7,duration_ms:90000,sentence_count:7,sentence_current:3,sentences_done:2}};
  w.windowAt=(index:number)=>{w.state.driving_listen.lyrics_current=index;w.state.driving_listen.lyrics=words.map((text,index)=>({index,text})).filter(x=>Math.abs(x.index-index)<=2);};w.windowAt(2);
  w.publish=()=>w.nativeStatus(w.state);
  w.NativeDiary={theme:()=>JSON.stringify(w.state),invoke:(raw:string)=>{const r=JSON.parse(raw);let value:any=w.state;
   if(r.cmd==='list')value={items:[]};
   if(r.cmd==='listenPage')value={items:[{id:'synthetic-a.wav',title:'바다를 싣고 돌아온 날',year:'2099',month_day:'11.14',date:'2099년 11월 14일',weekday:'토요일'}],version:1,total:1};
   setTimeout(()=>w.NativeReply(r.id,value),0);
  }};
 },{theme,words});
 await p.route(origin+'/**',async route=>{const path=new URL(route.request().url()).pathname;
  try{await route.fulfill({body:await readFile(join('apps/web/public',path)),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'} as any)[extname(path)]||'application/octet-stream'});}catch{await route.fulfill({status:404});}
 });
 await p.goto(origin+'/faithful/app.html#carhome');
 const lyrics=p.locator('[data-diary-lyrics]'),active=p.locator('.lyric-line[aria-current=true]');
 await expect(lyrics).toBeVisible();await expect(p.locator('[data-lyric-index]')).toHaveCount(5);await expect(active).toHaveText(words[2]);
 async function fits(){
  await expect.poll(async()=>{const b=(await lyrics.boundingBox())!,a=(await active.boundingBox())!;return Math.abs(a.y+a.height/2-(b.y+b.height/2))}).toBeLessThan(2);
  const box=(await lyrics.boundingBox())!,line=(await active.boundingBox())!;
  expect(Math.abs(line.y+line.height/2-(box.y+box.height/2))).toBeLessThan(2);
  expect(line.y).toBeGreaterThanOrEqual(box.y-1);expect(line.y+line.height).toBeLessThanOrEqual(box.y+box.height+1);
  expect(await active.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
 }
 await fits();await expect(active).toHaveCSS('opacity','1');await expect(p.locator('[data-lyric-index="0"]')).toHaveCSS('opacity','0.18');
 await expect(p.locator('[data-listen-progress]')).toBeHidden();await expect(p.locator('[data-listen-duration]')).toHaveText('');await expect(p.locator('[data-listen-position]')).toHaveText('0:07');
 await p.screenshot({path:`test-results/c052/lyrics-${theme}.png`});
 const count=await p.evaluate(()=>(window as any).animationCount);
 await p.evaluate(()=>{const w=window as any;for(let i=0;i<5;i++){w.state.driving_listen.elapsed=8+i;w.publish()}});
 expect(await p.evaluate(()=>(window as any).animationCount)).toBe(count);
 await p.locator('[data-drive=listenToggle]').focus();
 await p.evaluate(()=>{const w=window as any;w.windowAt(3);w.publish()});
 expect(await p.locator('[data-lyric-index="2"]').evaluate(e=>e.getAnimations().some(a=>(a as CSSTransition).transitionProperty==='opacity'))).toBe(true);
 await expect(active).toHaveText(words[3]);await expect(p.locator('[data-lyric-index="0"]')).toHaveCount(0);await expect(p.locator('[data-lyric-index]')).toHaveCount(5);
 expect(await p.evaluate(()=>document.activeElement?.getAttribute('data-drive'))).toBe('listenToggle');
 await p.waitForTimeout(350);await fits();
 await p.evaluate(()=>{const w=window as any;w.state.driving_listen.paused=true;w.state.driving_listen.playing=false;w.publish()});
 await expect(active).toHaveText(words[3]);await expect(p.locator('[data-listen-duration]')).toHaveText('일시정지');
 await p.evaluate(()=>{const w=window as any;w.windowAt(5);w.publish()});
 await expect(p.locator('[data-lyric-index]')).toHaveCount(4);await expect(p.locator('[data-lyric-index="1"]')).toHaveCount(0);await expect(p.locator('[data-lyric-index="2"]')).toHaveCount(0);
 await p.evaluate(()=>{const w=window as any;w.state.driving_listen.mode='original';w.state.position=20;w.publish()});
 await expect(lyrics).toBeHidden();await expect(p.locator('[data-lyric-index]')).toHaveCount(0);await expect(p.locator('[data-listen-progress]')).toBeVisible();await expect(p.locator('[data-listen-duration]')).toHaveText('1:30');
 await p.evaluate(()=>{const w=window as any;w.state.driving_listen.mode='diary';w.state.driving_listen.narration_complete=true;w.windowAt(6);w.publish()});
 await expect(active).toHaveText(words[6]);await expect(p.locator('[data-lyric-index]')).toHaveCount(3);
 await p.evaluate(()=>{const w=window as any;Object.assign(w.state.driving_listen,{memory:'synthetic-b.wav',lyrics_current:0,lyrics:[{index:0,text:'AI 생성 일기 목업 입니다.'}],narration_complete:false,paused:false});w.publish()});
 await expect(active).toHaveText('AI 생성 일기 목업 입니다.');await expect(p.locator('[data-lyric-index]')).toHaveCount(1);await fits();
 await p.evaluate(()=>{const w=window as any;w.state.driving_listen.lyrics=[{index:0,text:'가족'.repeat(120)}];w.publish()});
 await fits();await p.screenshot({path:`test-results/c052/long-${theme}.png`});
 await p.emulateMedia({reducedMotion:'reduce'});const before=await p.evaluate(()=>(window as any).animationCount);
 await p.evaluate(()=>{const w=window as any;w.state.driving_listen.memory='synthetic-a.wav';w.windowAt(2);w.publish()});
 await expect(active).toHaveText(words[2]);expect(await p.evaluate(()=>(window as any).animationCount)).toBe(before);await expect(active).toHaveCSS('transition-duration','0s');
 await p.evaluate(()=>{const w=window as any;w.windowAt(3);w.publish()});await fits();expect(await p.evaluate(()=>(window as any).animationCount)).toBe(before);
 await p.evaluate(()=>{const w=window as any;w.state.driving_listen.lyrics=[];w.state.driving_listen.lyrics_current=-1;w.publish()});await expect(p.locator('[data-lyric-index]')).toHaveCount(0);
 await p.close();
}expect(errors).toEqual([]);console.log('PASS C052: centered ±2 lyric window, fading/movement, bounded DOM, stable ticker/pause, focus, single/long text, original switch, completion, reduced motion (synthetic).');}
finally{await browser.close();}
