import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
async function create(page){
 await page.goto('/');await page.getByRole('button',{name:'New document'}).click();
 await page.getByLabel('Document (Markdown)').fill('Original source');await expect(page.getByRole('status')).toHaveText('Saved locally');
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Upgrade to structured document'}).click();
 await expect(page.getByRole('textbox',{name:'Visual document'})).toBeVisible();await expect(page.getByRole('status')).toHaveText('Saved locally');
}
test('O5.3-Q01 native BibTeX file picker stages then imports, rejects oversize and preserves state',async({page})=>{
 await create(page);await page.getByRole('button',{name:'Research sources',exact:true}).click();await page.getByText('Import BibTeX',{exact:true}).click();
 const input=page.getByLabel('BibTeX file',{exact:true}),area=page.getByLabel('BibTeX input'),list=page.getByLabel('Research source',{exact:true});
 const source='@article{file,title={Picked paper},year=2026}';
 const picker=page.waitForEvent('filechooser');await input.click();await (await picker).setFiles({name:'references.bib',mimeType:'text/plain',buffer:Buffer.from(source)});
 await expect(area).toHaveValue(source);await expect(list.locator('option')).toHaveCount(0);await page.getByRole('button',{name:'Import entries',exact:true}).click();await expect(list.locator('option')).toHaveCount(1);
 await input.setInputFiles({name:'oversized.bib',mimeType:'text/plain',buffer:Buffer.alloc(180001,65)});await expect(page.getByText('BibTeX file exceeds limit.',{exact:true})).toBeVisible();await expect(list.locator('option')).toHaveCount(1);
 await page.getByRole('button',{name:'Close research dialog'}).click();await expect(page.getByRole('status')).toHaveText('Saved locally');await page.reload();await page.getByRole('button',{name:'Research sources',exact:true}).click();await expect(list.locator('option')).toHaveText(['file — Picked paper']);
});
test('publication template downloads real standalone TeX without changing the saved document',async({page})=>{
 await create(page);await page.getByRole('button',{name:'Academic publication',exact:true}).click();
 await page.getByLabel('Publication template').selectOption('report');await page.getByLabel('Publication author').fill('Ada Lovelace');await page.getByLabel('Publication abstract').fill('A summary.');
 const dl=page.waitForEvent('download');await page.getByRole('button',{name:'Download LaTeX',exact:true}).click();const file=await dl;expect(file.suggestedFilename()).toMatch(/\.tex$/);
 const tex=await readFile(await file.path(),'utf8');expect(tex).toContain('\\documentclass[12pt]{report}');expect(tex).toContain('\\author{Ada Lovelace}');expect(tex).toContain('Original source');expect(tex).toContain('\\end{document}');
 await page.getByRole('button',{name:'Close publication',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Saved locally');
});
