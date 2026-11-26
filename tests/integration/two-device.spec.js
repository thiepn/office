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
 await expect(page).toHaveURL(/workspace=account/);await expect(page.getByRole('button',{name:'Synchronize now'})).toBeEnabled();
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
test('independent devices discover remote records, replay lost acknowledgement, resolve divergence and isolate other owner',async({browser,browserName})=>{
 const devices=[];try{
 const first=await device(browser,'device-a');devices.push(first);const second=await device(browser,'device-b');devices.push(second);const other=await device(browser,'other-owner');devices.push(other);
 const a=first.page,b=second.page,c=other.page,title='Two device '+browserName+' '+Date.now();
 await a.getByRole('button',{name:'New document'}).click();
 await expect(a.getByLabel('Document (Markdown)')).toBeVisible();await a.getByLabel('Document title').fill(title);await a.getByLabel('Document (Markdown)').fill('Initial source');await expect(a.getByRole('status')).toHaveText('Saved locally');
 const id=new URL(a.url()).searchParams.get('id');await library(a);const initial=await row(a,id);expect(initial.pending.length).toBeGreaterThan(0);
 await a.evaluate(()=>sessionStorage.setItem('office-integration-drop','1'));await sync(a,'Synchronization unavailable · local edits and queue retained.');
 const interrupted=await row(a,id);expect(interrupted.pending[0].id).toBe(initial.pending[0].id);
 // Independently observe the committed first operation before retrying its lost receipt.
 await sync(b);const committed=await row(b,id);expect(committed.doc).toEqual(initial.pending[0].doc);expect(committed.remoteRevision).toBe(initial.pending[0].doc.revision);
 // First operation is a blank create. Retry after reload must replay it without creating a duplicate or extra revision.
 await a.reload();await sync(a);expect((await row(a,id)).pending).toHaveLength(0);
 await sync(b);await expect(b.getByRole('link',{name:title,exact:true})).toBeVisible();expect((await row(b,id)).doc).toEqual((await row(a,id)).doc);
 await sync(c);await expect(c.getByRole('link',{name:title,exact:true})).toHaveCount(0);
 // Offline edits remain local; both devices edit from the same server revision.
 await b.getByRole('link',{name:title,exact:true}).click();await expect(b.getByLabel('Document (Markdown)')).toHaveValue('Initial source');await b.evaluate(()=>sessionStorage.setItem('office-integration-offline','1'));await b.getByLabel('Document (Markdown)').fill('Remote winner');await expect(b.getByRole('status')).toHaveText('Saved locally');await b.evaluate(()=>sessionStorage.removeItem('office-integration-offline'));await library(b);
 await edit(a,title,'Local divergent version');const local=await row(a,id);await sync(b);await sync(a,'Cloud conflict · 1 document(s); both versions retained.');
 const conflict=await row(a,id);expect(conflict.doc.body).toBe('Local divergent version');expect(conflict.conflict.document.body).toBe('Remote winner');
 await a.reload();const card=a.locator('article').filter({has:a.getByRole('link',{name:title,exact:true})});await card.getByText('Resolve cloud conflict',{exact:true}).click();
 a.once('dialog',d=>d.accept());await card.getByRole('button',{name:'Keep local as separate document'}).click();
 await expect(a.getByText('Conflict recovery archive',{exact:true})).toBeVisible();const archive=a.waitForEvent('download');await a.getByRole('button',{name:'Export archived conflict '+id,exact:true}).click();const data=JSON.parse(await readFile(await (await archive).path(),'utf8'));
 expect(data.local).toEqual(local.doc);expect(data.remote.body).toBe('Remote winner');expect(data.pending.length).toBeGreaterThan(0);
 await sync(a);await sync(b);await expect(b.getByRole('link',{name:title,exact:true})).toHaveCount(2);
 const docs=await b.evaluate(async owner=>{const {openAccountWorkspace}=await import('/assets/account-store.js');const s=await openAccountWorkspace({status:'signed-in',id:owner});try{return await s.list();}finally{s.close();}},A);
 const pair=docs.filter(d=>d.title===title);expect(pair.map(d=>d.body).sort()).toEqual(['Local divergent version','Remote winner']);expect(pair.find(d=>d.id===id).body).toBe('Remote winner');expect(pair.find(d=>d.id!==id).history).toEqual(local.doc.history);
 await a.reload();await expect(a.getByRole('button',{name:'Export archived conflict '+id,exact:true})).toBeVisible();
 }finally{await Promise.all(devices.map(d=>d.context.close()));}
});
