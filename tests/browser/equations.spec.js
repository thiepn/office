import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
async function create(page){
 await page.goto('/');await page.getByRole('button',{name:'New document'}).click();
 await page.getByLabel('Document (Markdown)').fill('Original source');await expect(page.getByRole('status')).toHaveText('Saved locally');
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Upgrade to structured document'}).click();
 await expect(page.getByRole('textbox',{name:'Visual document'})).toBeVisible();await expect(page.getByRole('status')).toHaveText('Saved locally');
}
async function equation(page,display,latex){
 await page.getByRole('button',{name:display?'Insert display equation':'Insert inline equation',exact:true}).click();
 await page.getByLabel('Equation LaTeX').fill(latex);
 await expect(page.getByLabel('Equation preview').locator('math')).toBeVisible();
 await page.getByRole('button',{name:'Apply equation'}).click();
 await expect(page.getByRole('status')).toHaveText('Saved locally');
}
test('inline and display math render, edit, renumber and preserve original source after reload',async({page})=>{
 await create(page);const url=page.url();
 await page.locator('.ProseMirror p').first().click();await page.keyboard.press('End');
 await equation(page,false,'x^2');await expect(page.locator('.office-equation-inline math')).toHaveCount(1);
 await equation(page,true,'\\frac{1}{2}');
 await expect(page.locator('.ProseMirror .office-equation-display')).toHaveCount(1);
 await equation(page,true,'\\int_0^1 x\\,dx');
 const rows=page.locator('.ProseMirror .office-equation-display');
 await expect(rows).toHaveCount(2);await expect(rows.locator('.office-equation-number')).toHaveText(['(1)','(2)']);
 await rows.first().click();await page.getByRole('button',{name:'Edit selected equation'}).click();
 await expect(page.getByLabel('Equation LaTeX')).toHaveValue('\\frac{1}{2}');
 await page.getByLabel('Equation LaTeX').fill('\\sqrt{2}');await page.getByLabel('Automatic equation number').uncheck();
 await page.getByRole('button',{name:'Apply equation'}).click();await expect(page.getByRole('status')).toHaveText('Saved locally');
 await expect(rows.locator('.office-equation-number')).toHaveText(['','(1)']);
 await page.reload();await expect(rows).toHaveCount(2);expect(page.url()).toBe(url);await expect(rows.locator('.office-equation-number')).toHaveText(['','(1)']);
 await expect(page.locator('.office-equation-inline math')).toHaveCount(1);
 const dl=page.waitForEvent('download');await page.getByRole('button',{name:'Export structured JSON'}).click();
 const json=JSON.parse(await readFile(await (await dl).path(),'utf8'));
 expect(json.rich.originalMarkdown).toBe('Original source');
 const formulas=json.rich.content.content.flatMap(n=>n.type==='displayEquation'?[n]:n.content?.filter(c=>c.type==='inlineEquation')??[]);
 expect(formulas.map(n=>n.attrs.latex)).toEqual(expect.arrayContaining(['x^2','\\sqrt{2}','\\int_0^1 x\\,dx']));
 expect(formulas.filter(n=>n.type==='displayEquation').map(n=>n.attrs.numbered)).toEqual([false,true]);
 const source=page.waitForEvent('download');await page.getByRole('button',{name:'Export equation sources'}).click();expect(await readFile(await (await source).path(),'utf8')).toContain('\\sqrt{2}');
 await page.getByRole('button',{name:'Markdown source'}).click();await expect(page.getByLabel('Document (Markdown)')).toHaveValue('Original source');
});
test('invalid or unsafe LaTeX cannot apply; cancel leaves document unchanged',async({page})=>{
 await create(page);await page.getByRole('button',{name:'Insert inline equation'}).click();
 const input=page.getByLabel('Equation LaTeX');
 for(const latex of ['\\frac{','\\href{https://example.com}{x}','\\gdef\\foo{x}']){await input.fill(latex);await expect(page.getByRole('button',{name:'Apply equation'})).toBeDisabled();await expect(page.getByText('Invalid or unsupported LaTeX. Correct the source before applying.')).toBeVisible();}
 await page.getByRole('button',{name:'Cancel equation'}).click();await expect(page.locator('.ProseMirror .office-equation')).toHaveCount(0);await expect(page.getByRole('status')).toHaveText('Saved locally');
});
