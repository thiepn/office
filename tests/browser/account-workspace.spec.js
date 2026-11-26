import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
async function fixture(page){
 await page.route('**/assets/boot.js',r=>r.fulfill({contentType:'text/javascript',body:"import '/tests/browser/fixtures/account-entry.js';"}));
 await page.route('**/assets/callback.js',r=>r.fulfill({contentType:'text/javascript',body:"import '/tests/browser/fixtures/account-entry.js';"}));
}
async function connect(page){await fixture(page);await page.goto('/');await page.getByRole('button',{name:'Connect THIEPN Account'}).click();await expect(page).toHaveURL(/workspace=account/);await expect(page.getByRole('button',{name:'Disconnect account'})).toBeVisible();}
async function doc(page,text){await page.getByRole('button',{name:'New document'}).click();await expect(page.getByLabel('Document (Markdown)')).toBeVisible();await page.getByLabel('Document (Markdown)').fill(text);await expect(page.getByRole('status')).toHaveText('Saved locally');}
test('production account activation stays disabled even on direct account and callback routes',async({page})=>{
 await page.goto('/');await expect(page.getByRole('button',{name:'Connect THIEPN Account'})).toBeDisabled();
 await page.goto('/?workspace=account');await expect(page.getByText('Account activation is disabled. Return to the guest workspace.')).toBeVisible();await expect(page.getByRole('button',{name:'New document'})).toHaveCount(0);
 await page.goto('/auth/callback/?code=fixture&state=fixture');await expect(page.getByRole('status')).toHaveText('Account activation is disabled. No authorization code was exchanged.');await expect(page).toHaveURL(/\/auth\/callback\/$/);
});
test('shared SDK PKCE explicit connection, guest separation and local disconnection',async({page})=>{
 await fixture(page);await page.goto('/');await doc(page,'guest private text');await page.getByRole('link',{name:'All documents'}).click();
 await page.getByRole('button',{name:'Connect THIEPN Account'}).click();await expect(page).toHaveURL(/workspace=account/);
 const auth=await page.evaluate(()=>sessionStorage.getItem('office-fixture-authorize'));const url=new URL(auth);expect(url.searchParams.get('code_challenge_method')).toBe('S256');expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);expect(url.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/);
 await expect(page.getByText('Start your first document')).toBeVisible();await doc(page,'account private text');await page.getByRole('link',{name:'All documents'}).click();await expect(page.getByRole('link',{name:'Untitled document',exact:true})).toHaveCount(1);
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Disconnect account'}).click();await expect(page).toHaveURL(/\/$/);await page.getByRole('link',{name:'Untitled document',exact:true}).click();await expect(page.getByLabel('Document (Markdown)')).toHaveValue('guest private text');
});
// Navigation completion alone does not guarantee that the module fixture and library are ready.
async function setLibraryMode(page,mode){
 await expect(page.getByRole('button',{name:'Synchronize now'})).toBeEnabled();
 await expect(page.getByRole('link',{name:'Untitled document',exact:true})).toBeVisible();
 await page.waitForFunction(()=>typeof window.officeFixture?.setMode==='function');
 await page.evaluate(value=>window.officeFixture.setMode(value),mode);
}
test('offline save, retry and durable conflict export',async({page})=>{
 await connect(page);await doc(page,'local source');await page.getByRole('link',{name:'All documents'}).click();await setLibraryMode(page,'offline');await expect(page.getByText('Offline · edits remain local',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Synchronize now'}).click();await expect(page.getByText('Offline · edits remain local',{exact:true})).toBeVisible();
 await setLibraryMode(page,'online');await expect(page.getByText('Account workspace · connected',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Synchronize now'}).click();await expect(page.getByText('Synchronized queued changes.',{exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Untitled document',exact:true}).click();await page.getByLabel('Document (Markdown)').fill('competing local draft');await expect(page.getByRole('status')).toHaveText('Saved locally');await page.getByRole('link',{name:'All documents'}).click();
 await setLibraryMode(page,'conflict');await page.getByRole('button',{name:'Synchronize now'}).click();await expect(page.getByText('Cloud conflict — both versions retained',{exact:true})).toBeVisible();
 await page.reload();await expect(page.getByRole('button',{name:'Export conflict recovery'})).toBeVisible();const dl=page.waitForEvent('download');await page.getByRole('button',{name:'Export conflict recovery'}).click();const data=JSON.parse(await readFile(await (await dl).path(),'utf8'));expect(data.local.body).toBe('competing local draft');expect(data.remote.body).toBe('Synthetic remote copy');expect(data.pending.length).toBeGreaterThan(0);
});
test('identity switch locks old editor and retains owner-specific unsaved recovery',async({page})=>{
 await connect(page);await doc(page,'committed A');await page.getByLabel('Document (Markdown)').fill('unsaved A');await page.evaluate(()=>window.officeFixture.setOwner('B'));
 await expect(page.getByText('Account workspace locked. Reconnect to the same account to recover local drafts.',{exact:true})).toBeVisible();await expect(page.getByLabel('Document (Markdown)')).toHaveCount(0);
 // Wait for durable recovery, not merely the DOM lock.
 await expect.poll(()=>page.evaluate(async()=>{const {openAccountWorkspace}=await import('/assets/account-store.js');const s=await openAccountWorkspace({status:'signed-in',id:'a0000000-0000-4000-8000-000000000001'});try{return (await s.listDrafts()).some(x=>x.draft.body==='unsaved A');}finally{s.close();}})).toBe(true);
 await page.goto('/?workspace=account');await expect(page.getByText('Start your first document')).toBeVisible();await expect(page.getByText('Recovered unsaved drafts')).toHaveCount(0);
 await page.evaluate(()=>window.officeFixture.setOwner('A'));await page.goto('/?workspace=account');await expect(page.getByText('Recovered unsaved drafts')).toBeVisible();const dl=page.waitForEvent('download');await page.getByRole('button',{name:/Export draft/}).first().click();const data=JSON.parse(await readFile(await (await dl).path(),'utf8'));expect(data.body).toBe('unsaved A');
});
