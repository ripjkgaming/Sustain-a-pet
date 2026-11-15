/** Additional real UI close-ups in a fresh practice garden. No save injection. */
import fs from 'node:fs/promises';import path from 'node:path';
const {chromium}=await import('/home/ripjk/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'captures/details');await fs.mkdir(out,{recursive:true});
const b=await chromium.launch({headless:true,executablePath:'/home/ripjk/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const began=performance.now(),c=await b.newContext({viewport:{width:636,height:1371},timezoneId:'Asia/Singapore',recordVideo:{dir:out,size:{width:636,height:1371}}}),p=await c.newPage();
const hold=ms=>p.waitForTimeout(ms),events=[];
async function mark(name,action){const before=await p.evaluate(()=>JSON.parse(localStorage.getItem('sustain-a-pet-demo')));const start=(performance.now()-began)/1000;await action();await hold(3000);const after=await p.evaluate(()=>JSON.parse(localStorage.getItem('sustain-a-pet-demo')));events.push({name,start,end:(performance.now()-began)/1000,before,after});await p.screenshot({path:path.join(out,name+'.png')});await fs.writeFile(path.join(out,'evidence.json'),JSON.stringify({source:'separate fresh practice garden, actual UI close-ups, no save injection',events},null,2));console.log(name);}
try{
 await p.goto('http://127.0.0.1:5173/?demo=1');await p.locator('canvas').waitFor();await hold(3500);
 await p.locator('nav button').filter({hasText:'Shop'}).click();await hold(700);
 const row=p.locator('.shop-row').filter({has:p.getByRole('heading',{name:'Morning dew',exact:true})});
 await mark('buy-care',()=>row.getByRole('button',{name:/Buy/}).click());
 await mark('use-care',()=>row.getByRole('button',{name:/Use/}).click());
 await p.getByRole('button',{name:'Close garden journal'}).click();await hold(1000);
 await p.locator('nav button').filter({hasText:'Today'}).click();await p.locator('.journal-habits summary').click();
 const quiz=p.locator('.journal-habits .card');await quiz.scrollIntoViewIfNeeded();await hold(1500);
 const save=await p.evaluate(()=>JSON.parse(localStorage.getItem('sustain-a-pet-demo')));const items=JSON.parse(await fs.readFile(path.join(root,'../src/data/quiz.json'),'utf8'));const day=save.state.lastOpenDate,index=((Math.round((Date.parse(day+'T00:00:00Z')-Date.parse('2026-01-01T00:00:00Z'))/86400000)%items.length)+items.length)%items.length;
 await mark('daily-quiz',async()=>{await hold(2500);await quiz.locator('.opts button').nth(items[index].answer).click();});
}finally{const video=p.video();await c.close();await video.saveAs(path.join(out,'details-source.webm'));await b.close();}
