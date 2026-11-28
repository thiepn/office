import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
test('equation cross-reference follows stable UUID after edit, renumber, reload, unnumber and restore',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'New document'}).click();await page.getByLabel('Document (Markdown)').fill('Original source');await expect(page.getByRole('status')).toHaveText('Saved locally');
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Upgrade to structured document'}).click();await expect(page.getByRole('status')).toHaveText('Saved locally');
 async function insert(latex){await page.getByRole('button',{name:'Insert display equation',exact:true}).click();await page.getByLabel('Equation LaTeX').fill(latex);await page.getByRole('button',{name:'Apply equation'}).click();await expect(page.getByRole('status')).toHaveText('Saved locally');}
 await page.locator('.ProseMirror > p').first().click();await page.keyboard.press('End');await insert('x=1');
 const eq=page.locator('.office-equation-display').first();const id=await eq.getAttribute('data-equation-id');expect(id).toMatch(/^[a-f0-9-]{36}$/);
 await eq.click();await page.getByRole('button',{name:'Insert cross-reference',exact:true}).click();await page.getByLabel('Reference target').selectOption(id);await page.getByRole('button',{name:'Apply academic structure'}).click();await expect(page.getByRole('status')).toHaveText('Saved locally');
 const ref=page.locator('.office-academic-reference');await expect(ref).toHaveText('Equation (1)');await ref.dblclick();await expect(eq).toHaveClass(/ProseMirror-selectednode/);
 await page.getByRole('button',{name:'Edit selected equation'}).click();await page.getByLabel('Equation LaTeX').fill('x=2');await page.getByLabel('Automatic equation number').uncheck();await page.getByRole('button',{name:'Apply equation'}).click();await expect(ref).toHaveText('[Unresolved reference]');await expect(page.getByRole('status')).toHaveText('Saved locally');
 await page.reload();await expect(eq).toHaveAttribute('data-equation-id',id);await expect(ref).toHaveText('[Unresolved reference]');
 await eq.click();await page.getByRole('button',{name:'Edit selected equation'}).click();await page.getByLabel('Automatic equation number').check();await page.getByRole('button',{name:'Apply equation'}).click();await expect(ref).toHaveText('Equation (1)');await expect(page.getByRole('status')).toHaveText('Saved locally');
 await page.getByRole('button',{name:'Academic publication',exact:true}).click();const dl=page.waitForEvent('download');await page.getByRole('button',{name:'Download LaTeX'}).click();const tex=await readFile(await (await dl).path(),'utf8');expect(tex).toContain('\\label{eq:'+id+'}');expect(tex).toContain('\\eqref{eq:'+id+'}');
});
