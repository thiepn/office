import {test,expect} from '@playwright/test';
async function open(page){await page.goto('/');await page.getByRole('button',{name:'New document'}).click();await page.getByLabel('Document (Markdown)').fill('# Overview\n\nOriginal source');await expect(page.getByRole('status')).toHaveText('Saved locally');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Upgrade to structured document'}).click();await expect(page.getByRole('textbox',{name:'Visual document'})).toBeVisible();await expect(page.getByRole('status')).toHaveText('Saved locally');}
test('authoring typography and page settings survive reload with original Markdown',async({page})=>{
 await open(page);const p=page.locator('.ProseMirror p').first();await p.click();await page.keyboard.press('Home');await page.keyboard.press('Shift+End');
 await page.getByLabel('Font family').selectOption('sans');await expect(p.locator('[data-office-font="sans"]')).toHaveText('Original source');
 await page.getByLabel('Alignment').selectOption('center');await expect(p).toHaveAttribute('data-office-align','center');
 await page.getByLabel('Paper size').selectOption('Letter');await page.getByLabel('Orientation').selectOption('landscape');await page.getByLabel('Margins').selectOption('25');await expect(page.getByRole('status')).toHaveText('Saved locally');
 await page.reload();await expect(page.locator('.ProseMirror [data-office-font="sans"]')).toHaveText('Original source');await expect(page.getByLabel('Orientation')).toHaveValue('landscape');await expect(page.getByLabel('Margins')).toHaveValue('25');
 await expect(page.getByRole('navigation',{name:'Document outline'}).getByRole('button',{name:'Overview'})).toBeVisible();
 await page.getByRole('button',{name:'Markdown source'}).click();await expect(page.getByLabel('Document (Markdown)')).toHaveValue('# Overview\n\nOriginal source');
});
test('structured export and explicit import make a new copy without changing source',async({page})=>{
 await open(page);const url=page.url();const event=page.waitForEvent('download');await page.getByRole('button',{name:'Export structured JSON'}).click();const file=await event;const buffer=await (await import('node:fs/promises')).readFile(await file.path());
 await page.getByRole('link',{name:'All documents'}).click();await expect(page.getByRole('button',{name:'Import structured document'})).toBeVisible();page.once('dialog',d=>d.accept());await page.locator('input[type=file]').setInputFiles({name:'report.office.json',mimeType:'application/json',buffer});await expect(page.getByRole('textbox',{name:'Visual document'})).toContainText('Original source');expect(page.url()).not.toBe(url);
 await page.goto(url);await expect(page.getByRole('textbox',{name:'Visual document'})).toContainText('Original source');
});
test('library does not load editor bundle and invalid exchange creates no record',async({page})=>{
 const requests=[];page.on('request',r=>requests.push(r.url()));await page.goto('/');await expect(page.getByRole('button',{name:'New document'})).toBeVisible();expect(requests.some(x=>x.includes('structured-bundle.js'))).toBe(false);
 await page.locator('input[type=file]').setInputFiles({name:'bad.office.json',mimeType:'application/json',buffer:Buffer.from('{"kind":"bad"}')});await expect(page.getByRole('status')).toContainText('Invalid Office exchange document');await expect(page.getByText('Start your first document')).toBeVisible();
});
test('print action uses selected paper settings and hides editing chrome',async({page})=>{
 await open(page);await page.getByLabel('Paper size').selectOption('Letter');await page.getByLabel('Orientation').selectOption('landscape');await page.getByLabel('Margins').selectOption('25');
 await page.evaluate(()=>{window.print=()=>{window.officePrintCalled=true;};});await page.getByRole('button',{name:'Print / Save PDF'}).click();expect(await page.evaluate(()=>window.officePrintCalled)).toBe(true);
 await page.emulateMedia({media:'print'});await expect(page.locator('.office-ribbon')).toBeHidden();await expect(page.locator('.visual-page')).toBeVisible();await expect(page.locator('style[data-office-print]')).toHaveText('@page { size: Letter landscape; margin: 25mm; }');await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
});
