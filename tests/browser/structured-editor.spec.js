import {test,expect} from '@playwright/test';
async function create(page){
 await page.goto('/');await page.getByRole('button',{name:'New document'}).click();
 await page.getByLabel('Document (Markdown)').fill('Original source');await expect(page.getByRole('status')).toHaveText('Saved locally');
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Upgrade to structured document'}).click();
 await expect(page.getByRole('textbox',{name:'Visual document'})).toBeVisible();
 await expect(page.getByRole('status')).toHaveText('Saved locally');
}
test('structured conversion, table and original source persist with one document ID',async({page})=>{
 await create(page);const url=page.url();
 await page.getByRole('button',{name:'Insert table'}).click();
 await expect(page.locator('.ProseMirror table')).toBeVisible();
 await expect(page.getByRole('status')).toHaveText('Saved locally');
 await page.reload();expect(page.url()).toBe(url);await expect(page.locator('.ProseMirror table')).toBeVisible();
 await page.getByRole('button',{name:'Markdown source'}).click();const body=page.getByLabel('Document (Markdown)');await expect(body).toHaveValue('Original source');await expect(body).not.toBeEditable();
 await page.getByRole('button',{name:'Visual editor (beta)'}).click();await expect(page.locator('.ProseMirror table')).toBeVisible();
});
test('structured editor formatting, link and undo redo use transactions',async({page})=>{
 await create(page);const p=page.locator('.ProseMirror p').first();await p.click();await page.keyboard.press('Home');await page.keyboard.press('Shift+End');
 await page.getByRole('button',{name:'Underline',exact:true}).click();await expect(page.locator('.ProseMirror u')).toHaveText('Original source');
 page.once('dialog',d=>d.accept('https://example.com/'));await page.getByRole('button',{name:'Link',exact:true}).click();await expect(page.locator('.ProseMirror a')).toHaveAttribute('href','https://example.com/');
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.locator('.ProseMirror a')).toHaveCount(0);
 await page.getByRole('button',{name:'Redo',exact:true}).click();await expect(page.locator('.ProseMirror a')).toHaveCount(1);
 await expect(page.getByRole('status')).toHaveText('Saved locally');
});
test('structured draft CAS retains competing edits and JSON export',async({page,context})=>{
 await create(page);const other=await context.newPage();await other.goto(page.url());const p=page.getByRole('textbox',{name:'Visual document'}),q=other.getByRole('textbox',{name:'Visual document'});
 await expect(q).toContainText('Original source');await p.fill('Winner');await expect(page.getByRole('status')).toHaveText('Saved locally');
 await q.fill('Stale structured text');await expect(other.getByRole('status')).toContainText('changed in another tab');
 const event=other.waitForEvent('download');await other.getByRole('button',{name:'Export structured JSON'}).click();const file=await event;
 const json=JSON.parse(await (await import('node:fs/promises')).readFile(await file.path(),'utf8'));expect(json.rich.originalMarkdown).toBe('Original source');expect(JSON.stringify(json.rich.content)).toContain('Stale structured text');
 await page.reload();await expect(p).toContainText('Winner');
});
