import {test,expect} from '@playwright/test';

test('atomic rollback and concurrent CAS preserve one committed revision',async({page})=>{
 await page.goto('/');await expect(page.getByRole('button',{name:'New document'})).toBeEnabled();
 const result=await page.evaluate(async()=>{
  const {openOffice,DB_NAME}=await import('/assets/store.js');
  const a=await openOffice(),b=await openOffice();
  try{
   const d=await a.add('Transaction test','original');
   const results=await Promise.allSettled([a.save(d.id,0,{body:'a'}),b.save(d.id,0,{body:'b'})]);
   const before=await a.get(d.id);
   let rejected=false;
   try{await a.run('readwrite',(s,done,fail)=>{const req=s.put({...before,body:'must roll back'});req.onsuccess=()=>fail(new Error('test rollback'));});}catch(e){rejected=e.message==='test rollback';}
   const after=await a.get(d.id);
   return {db:DB_NAME,success:results.filter(x=>x.status==='fulfilled').length,conflicts:results.filter(x=>x.status==='rejected'&&x.reason.name==='Conflict').length,rejected,before,after};
  }finally{a.db.close();b.db.close();}
 });
 expect(result.db).toBe('thiepn-standalone-office-o2');
 expect(result.success).toBe(1);expect(result.conflicts).toBe(1);expect(result.rejected).toBe(true);
 expect(result.after).toEqual(result.before);expect(result.after.revision).toBe(1);expect(result.after.history[0].body).toBe('original');
});

test('keyboard navigation, accessible headings, and 320px light/dark reflow',async({page})=>{
 await page.setViewportSize({width:320,height:700});
 await page.goto('/');await expect(page.getByRole('heading',{level:1,name:'Your documents'})).toBeVisible();
 await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Skip to content'})).toBeFocused();
 await page.keyboard.press('Enter');await expect(page.locator('#main')).toBeFocused();
 const newDoc=page.getByRole('button',{name:'New document'});await newDoc.focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('heading',{level:1,name:'Document editor'})).toBeVisible();
 const title=page.getByLabel('Document title'),body=page.getByLabel('Document (Markdown)');await title.fill('Keyboard notes');await body.fill('Test keyboard access');
 await expect(page.getByRole('status')).toHaveText('Saved locally');
 for(const colorScheme of ['light','dark']){
  await page.emulateMedia({colorScheme});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await expect(body).toBeVisible();
 }
 await page.getByRole('link',{name:'All documents'}).click();
 await expect(page.getByRole('link',{name:'Keyboard notes',exact:true})).toBeVisible();
 const duplicate=page.getByRole('button',{name:'Duplicate'});await duplicate.focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('link',{name:'Keyboard notes (copy)',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Keyboard notes',exact:true})).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test('local-only database does not read or mutate Hub Office storage',async({page})=>{
 await page.goto('/');await expect(page.getByRole('button',{name:'New document'})).toBeEnabled();
 await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('thiepn-hub-office-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('sentinel');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('sentinel','readwrite');tx.objectStore('sentinel').put('unchanged','hub');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};}));
 await page.getByRole('button',{name:'New document'}).click();await page.getByLabel('Document (Markdown)').fill('Standalone only');await expect(page.getByRole('status')).toHaveText('Saved locally');
 const sentinel=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('thiepn-hub-office-v1',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('sentinel','readonly'),q=tx.objectStore('sentinel').get('hub');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);tx.oncomplete=()=>db.close();};}));
 expect(sentinel).toBe('unchanged');
});
