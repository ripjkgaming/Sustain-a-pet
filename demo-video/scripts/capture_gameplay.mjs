/** Actual UI capture. No app source changes, save injection, or invented screens.
 * Run after game chat readiness: node scripts/capture_gameplay.mjs
 * Override CHROME_PATH / GAME_URL / PLAYWRIGHT_MODULE if this machine changes.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/home/ripjk/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'captures',new Date().toISOString().replaceAll(':','-'));
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/home/ripjk/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const events=[];
const began=performance.now();
const context=await browser.newContext({viewport:{width:636,height:1371},deviceScaleFactor:1,timezoneId:'Asia/Singapore',recordVideo:{dir:out,size:{width:636,height:1371}}});
const page=await context.newPage();
page.setDefaultTimeout(12000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const hold=(ms=1200)=>page.waitForTimeout(ms);
const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('sustain-a-pet-demo') || 'null'));
async function mark(name,action,pause=1600){
  const before=await state();const start=(performance.now()-began)/1000;
  if(action) await action(); await hold(pause);
  const after=await state();
  const item={name,start,end:(performance.now()-began)/1000,before,after};events.push(item);
  await page.screenshot({path:path.join(out,`${String(events.length).padStart(2,'0')}-${name}.png`)});
  await fs.writeFile(path.join(out,'evidence.json'),JSON.stringify({source:'actual running local game; fresh isolated browser context',url:page.url(),viewport:[636,1371],events,errors},null,2));
  console.log(`${name}: ${item.start.toFixed(2)}–${item.end.toFixed(2)}s`);
}
const nav=name=>page.locator('nav button').filter({hasText:name}).click();
const close=async()=>{if(await page.locator('.evolve').isVisible())await page.keyboard.press('Escape');const button=page.getByRole('button',{name:'Close garden journal'});if(await button.count())await button.click();};
async function today(){await nav('Today');await hold(400);}
async function daily(){await today();await page.getByRole('button',{name:/Collect today/}).click();}
async function tickDay(){
  await today(); const details=page.locator('.journal-habits');
  if(!await details.getAttribute('open'))await details.locator('summary').click();
  while(await details.locator('input[type=checkbox]:not(:checked)').count()){await details.locator('input[type=checkbox]:not(:checked)').first().check();await hold(500);}
  await close(); await page.locator('canvas').click({position:{x:315,y:640}}); // returns focus to world
  const save=await state();
  // Quiz uses the app's documented A/B/C keyboard controls; calculate today's source answer.
  const quiz=JSON.parse(await fs.readFile(path.join(root,'../src/data/quiz.json'),'utf8'));
  const date=save.state.lastOpenDate;const index=((Math.round((Date.parse(date+'T00:00:00Z')-Date.parse('2026-01-01T00:00:00Z'))/86400000)%quiz.length)+quiz.length)%quiz.length;
  await page.keyboard.press('abc'[quiz[index].answer]);await hold(1400);await page.keyboard.press('Escape');
  await today();
  while(await page.locator('.quest-row button').filter({hasText:/^Collect$/}).count()){await page.locator('.quest-row button').filter({hasText:/^Collect$/}).first().click();await hold(500);}
  await close();
}
async function skipDay(){await page.locator('.drawer-head').click();await hold(400);await page.getByRole('button',{name:'Skip 1 day',exact:true}).click();await hold(700);await page.locator('.drawer-head').click();const dismiss=page.getByRole('button',{name:'Dismiss'});if(await dismiss.count())await dismiss.click();}
try{
 await page.goto(process.env.GAME_URL || 'http://localhost:5173/?demo=1');await page.locator('canvas').waitFor();await hold(3000);await page.getByRole('button',{name:'Zoom in',exact:true}).click();await hold(800);await page.getByRole('button',{name:'Zoom in',exact:true}).click();await hold(1800);
 await mark('garden-establish',null,4500);

 await mark('daily-gift',daily,2600);await close();
 await mark('walk-to-quest',()=>page.mouse.click(220,770),4500);
 await mark('first-habit',async()=>{await today();await page.locator('.journal-habits summary').click();await page.getByRole('checkbox',{name:/Walked, cycled/}).check();},2600);await close();
 await mark('complete-day-one',tickDay,2600);
 await mark('shop-wildflowers',async()=>{await nav('Shop');await hold(900);await page.locator('.shop-row').filter({has:page.getByRole('heading',{name:'Wildflower patch',exact:true})}).getByRole('button',{name:/Buy/}).click();},2600);await close();
 await mark('placed-wildflowers',null,3600);
 await mark('adopt-mossy',async()=>{await nav('Friends');await hold(900);await page.locator('.companion-row').filter({has:page.getByRole('heading',{name:'Mossy',exact:true})}).getByRole('button',{name:/Adopt/}).click();},2200);
 await mark('switch-to-mossy',()=>page.locator('.companion-row').filter({has:page.getByRole('heading',{name:'Mossy',exact:true})}).getByRole('button',{name:'Explore',exact:true}).click(),1800);await close();
 await mark('mossy-in-garden',null,4000);
 await mark('restore-meadow',async()=>{await nav('Explore');await hold(900);await page.locator('.restoration-row').filter({has:page.getByRole('heading',{name:'Replant the flower bed',exact:true})}).getByRole('button',{name:/Restore/}).click();},2200);await close();
 await mark('restored-meadow-result',null,3600);
 await mark('simulated-day-two',skipDay,1800);
 await mark('day-two-gift',daily,1400);await close();
 await mark('unlock-pond',async()=>{await nav('Explore');await page.locator('.area-row').filter({has:page.getByRole('heading',{name:'Willow Pond',exact:true})}).getByRole('button',{name:/Unlock/}).click();},2000);
 await mark('visit-pond',null,1200);await close();
 await mark('pond-exploration',()=>page.mouse.click(420,700),4000);
 await mark('day-two-habits-and-quests',tickDay,1800);
 await mark('restore-bridge',async()=>{await nav('Explore');await page.locator('.restoration-row').filter({has:page.getByRole('heading',{name:'Mend the footbridge',exact:true})}).getByRole('button',{name:/Restore/}).click();},1800);await close();
 await mark('restored-pond-result',null,4000);
 await mark('simulated-day-three',skipDay,1400);
 await mark('day-three-gift',daily,1400);await close();
 await mark('day-three-habits-and-quests',tickDay,1800);
 await mark('unlock-grove',async()=>{await nav('Explore');await page.locator('.area-row').filter({has:page.getByRole('heading',{name:'Amber Grove',exact:true})}).getByRole('button',{name:/Unlock/}).click();},1800);
 await mark('visit-grove',null,1200);await close();
 await mark('grove-exploration',()=>page.mouse.click(220,720),4000);
 await mark('restore-tree',async()=>{await nav('Explore');await page.locator('.restoration-row').filter({has:page.getByRole('heading',{name:'Nurture the wishing tree',exact:true})}).getByRole('button',{name:/Restore/}).click();},1800);await close();
 await mark('restored-grove-result',null,5000);
 console.log(`Actual gameplay capture complete: ${out}`);
}catch(error){
 await page.screenshot({path:path.join(out,'failure.png')});await fs.writeFile(path.join(out,'failure.txt'),error.stack+'\n'+await page.locator('body').innerText());throw error;
}finally{
 const video=page.video();await context.close();if(video)await video.saveAs(path.join(out,'gameplay-source.webm'));await browser.close();
 await fs.writeFile(path.join(root,'captures/latest.json'),JSON.stringify({directory:out,video:path.join(out,'gameplay-source.webm'),events:events.length,errors},null,2));
}
