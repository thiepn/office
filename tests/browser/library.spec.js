import {test,expect} from '@playwright/test';
test('library creates, saves, reloads, searches, duplicates and restores',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'New document'}).click();
 await page.getByLabel('Document title').fill('Probability notes');await page.getByLabel('Document (Markdown)').fill('Expectation and variance');
 await expect(page.getByRole('status')).toHaveText('Saved locally');await page.reload();
 await expect(page.getByLabel('Document (Markdown)')).toHaveValue('Expectation and variance');
 await page.getByRole('link',{name:'All documents'}).click();
 await page.getByRole('searchbox',{name:'Search documents'}).fill('variance');
 await expect(page.getByRole('link',{name:'Probability notes',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Duplicate'}).click();await expect(page.getByRole('link',{name:'Probability notes (copy)'})).toBeVisible();
 const row=page.locator('article').filter({has:page.getByRole('link',{name:'Probability notes',exact:true})});
 page.once('dialog',d=>d.accept());await row.getByRole('button',{name:'Move to trash'}).click();await expect(row).toHaveCount(0);
 await page.getByRole('button',{name:'Trash',exact:true}).click();await page.getByRole('button',{name:'Restore'}).click();
 await page.getByRole('button',{name:'Documents',exact:true}).click();await expect(page.getByRole('link',{name:'Probability notes',exact:true})).toBeVisible();
});
test('cross-tab CAS preserves stale local draft',async({page,context})=>{
 await page.goto('/');await page.getByRole('button',{name:'New document'}).click();await page.getByLabel('Document (Markdown)').fill('initial');await expect(page.getByRole('status')).toHaveText('Saved locally');
 const other=await context.newPage();await other.goto(page.url());await expect(other.getByLabel('Document (Markdown)')).toHaveValue('initial');
 await page.getByLabel('Document (Markdown)').fill('first');await expect(page.getByRole('status')).toHaveText('Saved locally');
 await other.getByLabel('Document (Markdown)').fill('stale draft');await expect(other.getByRole('status')).toContainText('changed in another tab');await expect(other.getByLabel('Document (Markdown)')).toHaveValue('stale draft');await page.reload();await expect(page.getByLabel('Document (Markdown)')).toHaveValue('first');
});
test('mobile document library and editor stay within viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');await page.getByRole('button',{name:'New document'}).click();await expect(page.getByLabel('Document (Markdown)')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
test('Markdown export retains unsaved conflicting text and stored history stays intact',async({page,context})=>{
 await page.goto('/');await page.getByRole('button',{name:'New document'}).click();
 const body=page.getByLabel('Document (Markdown)');await body.fill('first revision');await expect(page.getByRole('status')).toHaveText('Saved locally');
 const other=await context.newPage();await other.goto(page.url());await expect(other.getByLabel('Document (Markdown)')).toHaveValue('first revision');
 await body.fill('second revision');await expect(page.getByRole('status')).toHaveText('Saved locally');await expect(page.getByText('Revision 1 ·',{exact:false})).toBeVisible();
 await other.getByLabel('Document (Markdown)').fill('unsaved conflicting draft');await expect(other.getByRole('status')).toContainText('changed in another tab');
 const promise=other.waitForEvent('download');await other.getByRole('button',{name:'Export Markdown'}).click();const download=await promise;
 expect(await (await import('node:fs/promises')).readFile(await download.path(),'utf8')).toBe('unsaved conflicting draft');
 other.once('dialog',d=>d.accept());await other.getByRole('button',{name:'Reload saved version'}).click();await expect(other.getByLabel('Document (Markdown)')).toHaveValue('second revision');
});
