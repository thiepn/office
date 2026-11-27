import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const A='a0000000-0000-4000-8000-000000000001';
async function device(browser,kind){
 const context=await browser.newContext({baseURL:'http://127.0.0.1:8000'});
 await context.addInitScript(value=>{if(!sessionStorage.getItem('office-integration-device'))sessionStorage.setItem('office-integration-device',value);},kind);
 await context.route('**/assets/boot.js',r=>r.fulfill({contentType:'text/javascript',body:"import '/tests/integration/fixtures/postgres-entry.js';"}));
 await context.route('**/assets/callback.js',r=>r.fulfill({contentType:'text/javascript',body:"import '/tests/integration/fixtures/postgres-entry.js';"}));
 await context.route('https://**/*',r=>r.abort());
 const page=await context.newPage();await page.goto('/');await page.getByRole('button',{name:'Connect THIEPN Account'}).click();
 await expect.poll(async()=>{const callback=page.locator('#callback-state');if(await callback.count()){const message=await callback.textContent();if(message?.startsWith('Synthetic callback rejected'))return message;}return new URL(page.url()).searchParams.get('workspace');},{message:'Synthetic OAuth callback must establish a verified account workspace'}).toBe('account');await expect(page.getByRole('button',{name:'Synchronize now'})).toBeEnabled();
 return {context,page};
}
async function library(page){await page.goto('/?workspace=account');await expect(page.getByRole('button',{name:'Synchronize now'})).toBeEnabled();}
async function sync(page,expected='Synchronized queued changes.'){
 const button=page.getByRole('button',{name:'Synchronize now'});await expect(button).toBeEnabled();await button.click();await expect(page.getByText(expected,{exact:true})).toBeVisible();await expect(button).toBeEnabled();
}
async function edit(page,title,body){
 await page.getByRole('link',{name:title,exact:true}).click();await expect(page.getByLabel('Document (Markdown)')).toBeVisible();await page.getByLabel('Document (Markdown)').fill(body);await expect(page.getByRole('status')).toHaveText('Saved locally');await library(page);
}
async function row(page,id){return page.evaluate(async({id,owner})=>{const {openAccountWorkspace}=await import('/assets/account-store.js');const s=await openAccountWorkspace({status:'signed-in',id:owner});try{return await s.inspect(id);}finally{s.close();}},{id,owner:A});}
test('research sources and stable citations synchronize with revision history and portable backup across independent contexts',async({browser,browserName})=>{
 const devices=[];try{
 const first=await device(browser,'device-a');devices.push(first);const second=await device(browser,'device-b');devices.push(second);const a=first.page,b=second.page,title='Research citations '+browserName+' '+Date.now();
 const expected=await a.evaluate(async({owner,title})=>{
  const {openAccountWorkspace}=await import('/assets/account-store.js');const s=await openAccountWorkspace({status:'signed-in',id:owner});const id=crypto.randomUUID();
  const rich={version:1,originalMarkdown:'Original source',content:{type:'doc',content:[{type:'paragraph',content:[{type:'researchCitation',attrs:{sourceId:id}}]},{type:'researchCatalog',attrs:{sources:[{id,key:'ada',type:'article',fields:{title:'First {Paper}',author:'Ada Lovelace',year:'1843'}}]}}]}};
  try{const d=await s.add(title,rich.originalMarkdown,rich);const next=structuredClone(rich);next.content.content[1].attrs.sources[0].key='renamed';return await s.save(d.id,d.revision,{rich:next},d);}finally{s.close();}
 },{owner:A,title});
 await a.reload();await sync(a);await sync(b);expect((await row(a,expected.id)).doc).toEqual(expected);expect((await row(b,expected.id)).doc).toEqual(expected);
 await b.getByRole('link',{name:title,exact:true}).click();await expect(b.locator('.office-citation')).toHaveText('[1]');await expect(b.locator('.office-bibliography li')).toHaveText(['Ada Lovelace. First {Paper}. 1843']);
 await library(b);await b.getByText('Migration and document backups',{exact:true}).click();const dl=b.waitForEvent('download');await b.getByRole('button',{name:'Export document backup'}).click();const backup=JSON.parse(await readFile(await (await dl).path(),'utf8'));
 expect(await b.evaluate(async({backup,id})=>{const {verifyPortableBackup}=await import('/assets/portable-backup.js');return (await verifyPortableBackup(backup)).documents.find(d=>d.id===id);},{backup,id:expected.id})).toEqual(expected);
 }finally{await Promise.all(devices.map(d=>d.context.close()));}
});
