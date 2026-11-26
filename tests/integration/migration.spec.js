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
 await expect(page).toHaveURL(/workspace=account/);await expect(page.getByRole('button',{name:'Synchronize now'})).toBeEnabled();return {context,page};
}
async function openPanel(page){await page.getByText('Migration and document backups',{exact:true}).click();}
async function sync(page){const b=page.getByRole('button',{name:'Synchronize now'});await expect(b).toBeEnabled();await b.click();await expect(page.getByText('Synchronized queued changes.',{exact:true})).toBeVisible();await expect(b).toBeEnabled();}
async function snapshot(page,ids){return page.evaluate(async({owner,ids})=>{const {openAccountWorkspace}=await import('/assets/account-store.js');const s=await openAccountWorkspace({status:'signed-in',id:owner});try{return await Promise.all(ids.map(id=>s.get(id)));}finally{s.close();}},{owner:A,ids});}
test('verified Hub and Office backups restore via real atomic batch, lost acknowledgement resumes and collisions block',async({browser,browserName})=>{
 const devices=[];try{
 const first=await device(browser,'device-a');devices.push(first);const second=await device(browser,'device-b');devices.push(second);const a=first.page,b=second.page;
 const id='migration-'+browserName+'-'+Date.now(),title='Hub backup '+id;
 const pair=await a.evaluate(async({id,title,owner})=>{
  const {createPortableBackup,verifyPortableBackup}=await import('/assets/portable-backup.js');
  const hub={schemaVersion:1,id,title,body:'Original **Markdown**\n한글',revision:3,updatedAt:'2026-01-02T00:00:00Z',history:[{revision:2,title,body:'Old\r\n',updatedAt:'2026-01-01T00:00:00Z'}]};
  const {create,revise}=await import('/assets/model.js');const source='Immutable source';const rich={version:1,originalMarkdown:source,content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Formatted content'}]}]}};
  const structured=revise(create(id+'-rich',title+' rich',source),0,{rich});
  const hubBackup=await createPortableBackup('hub','user:'+owner,[hub]);
  const officeBackup=await createPortableBackup('office','user:'+owner,[structured]);
  return {hubBackup,officeBackup,expected:[...(await verifyPortableBackup(hubBackup)).documents,structured]};
 },{id,title,owner:A});
 await openPanel(a);
 async function select(page,backup){
  await page.getByLabel('Select portable backup').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await expect(page.getByText('Preview ready. Type the exact source scope to attest ownership.',{exact:true})).toBeVisible();
  await page.getByLabel('Confirm source owner scope').fill('user:'+A);
 }
 await select(a,pair.hubBackup);await a.evaluate(()=>sessionStorage.setItem('office-integration-drop','1'));a.once('dialog',d=>d.accept());await a.getByRole('button',{name:'Import verified backup'}).click();
 await expect(a.getByText('Simulated lost commit acknowledgement',{exact:true})).toBeVisible();
 await expect(a.getByRole('button',{name:/Resume migration/})).toHaveCount(1);
 await sync(b);expect((await snapshot(b,[id]))[0]).toEqual(pair.expected[0]);
 await a.reload();await openPanel(a);await a.getByRole('button',{name:/Resume migration/}).click();await expect(a.getByText('Migration committed and restored locally.',{exact:true})).toBeVisible();
 expect((await snapshot(a,[id]))[0]).toEqual(pair.expected[0]);
 await select(a,pair.officeBackup);a.once('dialog',d=>d.accept());await a.getByRole('button',{name:'Import verified backup'}).click();await expect(a.getByText('Migration committed and restored locally.',{exact:true})).toBeVisible();
 await sync(b);expect(await snapshot(b,[id,id+'-rich'])).toEqual(pair.expected);
 // Verified backup can be exported and parsed; it includes the exact restored documents.
 const dl=a.waitForEvent('download');await a.getByRole('button',{name:'Export document backup'}).click();const exported=JSON.parse(await readFile(await (await dl).path(),'utf8'));
 const checked=await a.evaluate(async backup=>{const {verifyPortableBackup}=await import('/assets/portable-backup.js');return (await verifyPortableBackup(backup)).documents;},exported);
 expect(checked.filter(d=>[id,id+'-rich'].includes(d.id)).sort((x,y)=>x.id.localeCompare(y.id))).toEqual(pair.expected);
 // Existing IDs cannot be silently replaced, even by identical imported backups.
 await a.getByLabel('Select portable backup').setInputFiles({name:'collision.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(pair.hubBackup))});
 await expect(a.getByText('Collision detected. Nothing will be overwritten.',{exact:true})).toBeVisible();await expect(a.getByRole('button',{name:'Import verified backup'})).toBeDisabled();
 expect(await snapshot(a,[id,id+'-rich'])).toEqual(pair.expected);
 }finally{await Promise.all(devices.map(d=>d.context.close()));}
});
