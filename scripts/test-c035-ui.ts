import { chromium, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try {
 for(const dark of [false,true])for(const contest of [false,true]) {
  const page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'reduce'});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({dark,contest})=>{
   const w=window as any;w.__name=(v:any)=>v;w.calls=[];
   w.state={paired:false,server_setup_available:contest,vehicle:{nickname:'합성 우리 차'},theme_mode:dark?'dark':'light',theme_dark:dark,version:'0.2.0'};
   w.NativeDiary={theme:()=>JSON.stringify(w.state),invoke:(raw:string)=>{
    const r=JSON.parse(raw);w.calls.push(r);
    const answer=r.cmd==='list'?{items:[]}:r.cmd==='state'?{...w.state,settings:w.state}:w.state;
    setTimeout(()=>w.NativeReply(r.id,answer),0);
   }};
  },{dark,contest});
  await page.route('https://c035.test/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   try {await route.fulfill({body:await readFile(join('apps/web/public',path)),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'} as any)[extname(path)]||'application/octet-stream'});}
   catch {await route.fulfill({status:404});}
  });
  await page.goto('https://c035.test/faithful/app.html#carsettings');
  await expect(page.getByRole('heading',{name:'설정',exact:true})).toBeVisible();
  const action=page.locator('[data-server-import]');
  if(contest) {
   await expect(action).toBeVisible();const box=await action.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(48);
   await action.click();expect(await page.evaluate(()=>(window as any).calls.some((r:any)=>r.cmd==='importServerSettings'))).toBe(true);
   await page.screenshot({path:`docs/evidence/connected-ui/c035-settings-${dark?'dark':'light'}.png`});
  } else await expect(action).toBeHidden();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);await page.close();
 }
 console.log('PASS C035 contest-only import action, bridge dispatch, >=48px target, light/dark and no overflow. Synthetic browser bridge.');
}finally {await browser.close();}
