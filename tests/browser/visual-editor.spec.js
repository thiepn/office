import {test,expect} from '@playwright/test';
async function create(page,body=''){
 await page.goto('/');await page.getByRole('button',{name:'New document'}).click();
 const field=page.getByLabel('Document (Markdown)');await expect(field).toBeVisible();
 if(body){await field.fill(body);await expect(page.getByRole('status')).toHaveText('Saved locally');}
 return field;
}
async function selectText(page,selector){
 await page.locator(selector).evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r);});
}
test('visual opening and switching preserves exact Markdown and revision',async({page})=>{
 const original='# Research\n\nA **strong** and *careful* result.\n\n- First\n- Second\n\n> Evidence';
 const source=await create(page,original);const url=page.url();
 await page.getByRole('button',{name:'Visual editor (beta)'}).click();
 const visual=page.getByRole('textbox',{name:'Visual document'});
 await expect(visual.locator('h1')).toHaveText('Research');await expect(visual.locator('strong')).toHaveText('strong');await expect(visual.locator('li')).toHaveCount(2);
 await page.getByRole('button',{name:'Markdown source'}).click();await expect(source).toHaveValue(original);
 await page.reload();expect(page.url()).toBe(url);await expect(source).toHaveValue(original);
 await expect(page.getByText('revision 1',{exact:false}).first()).toBeVisible();
});
test('visual bold command writes canonical Markdown and survives reload',async({page})=>{
 const source=await create(page,'Probability');
 await page.getByRole('button',{name:'Visual editor (beta)'}).click();
 const visual=page.getByRole('textbox',{name:'Visual document'});
 await selectText(page,'.visual-page p');await page.getByRole('button',{name:'Bold',exact:true}).click();
 await expect(visual.locator('b,strong')).toHaveText('Probability');
 await expect(page.getByRole('status')).toHaveText('Saved locally');
 await page.getByRole('button',{name:'Markdown source'}).click();await expect(source).toHaveValue('**Probability**');
 await page.reload();await expect(source).toHaveValue('**Probability**');
});
test('unsupported source stays byte-for-byte unchanged and never executes HTML',async({page})=>{
 const raw='[Link](https://example.com)\n\n<img src=x onerror="window.officeInjected=true">\n\n|a|b|\n|-|-|';
 const source=await create(page,raw);
 await page.getByRole('button',{name:'Visual editor (beta)'}).click();
 await expect(source).toBeVisible();await expect(source).toHaveValue(raw);
 await expect(page.getByText('Original Markdown remains unchanged.',{exact:false})).toBeVisible();
 expect(await page.evaluate(()=>window.officeInjected)).toBeUndefined();
 await page.reload();await expect(source).toHaveValue(raw);
});
test('unsupported visual draft fails closed and can be recovered without changing stored record',async({page})=>{
 const source=await create(page,'Safe original');await page.getByRole('button',{name:'Visual editor (beta)'}).click();
 const visual=page.getByRole('textbox',{name:'Visual document'});await visual.fill('Unsupported [link]');
 await expect(page.getByRole('status')).toContainText('not saved');await expect(page.getByRole('button',{name:'Save',exact:true})).toBeDisabled();
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export visual recovery text'}).click();
 const download=await downloadPromise;expect(await (await import('node:fs/promises')).readFile(await download.path(),'utf8')).toBe('Unsupported [link]');
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Markdown source'}).click();await expect(source).toHaveValue('Safe original');
 await page.reload();await expect(source).toHaveValue('Safe original');
});
test('visual draft uses the same cross-tab CAS and original record',async({page,context})=>{
 const source=await create(page,'Initial');const other=await context.newPage();await other.goto(page.url());
 await expect(other.getByLabel('Document (Markdown)')).toHaveValue('Initial');
 await page.getByRole('button',{name:'Visual editor (beta)'}).click();
 await other.getByLabel('Document (Markdown)').fill('Committed elsewhere');await expect(other.getByRole('status')).toHaveText('Saved locally');
 await page.getByRole('textbox',{name:'Visual document'}).fill('Unsaved visual draft');
 await expect(page.getByRole('status')).toContainText('changed in another tab');
 await page.getByRole('button',{name:'Markdown source'}).click();await expect(source).toHaveValue('Unsaved visual draft');
 const saved=await other.getByLabel('Document (Markdown)').inputValue();expect(saved).toBe('Committed elsewhere');
});
