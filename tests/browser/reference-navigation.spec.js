import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
async function create(page){
 await page.goto('/');await page.getByRole('button',{name:'New document'}).click();
 await page.getByLabel('Document (Markdown)').fill('Original source');await expect(page.getByRole('status')).toHaveText('Saved locally');
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Upgrade to structured document'}).click();
 await expect(page.getByRole('textbox',{name:'Visual document'})).toBeVisible();await expect(page.getByRole('status')).toHaveText('Saved locally');
}
async function apply(page){await page.getByRole('button',{name:'Apply academic structure'}).click();await expect(page.getByRole('dialog',{name:/academic|cross-reference/i})).toHaveCount(0);await expect(page.getByRole('status')).toHaveText('Saved locally');}
async function add(page,kind,label){await page.getByRole('button',{name:'Insert academic block',exact:true}).click();await page.getByLabel('Academic block kind').selectOption(kind);await page.getByLabel('Academic label').fill(label);await apply(page);}
test('O5.2-Q01 reference navigation selects the stable target after renumber, rename and reload; missing target does not jump',async({page})=>{
 await create(page);await page.locator('.ProseMirror > p').first().click();
 await add(page,'theorem','thm:target');const blocks=page.locator('.ProseMirror .office-academic-block');const id=await blocks.first().getAttribute('data-academic-id');
 await page.keyboard.type('Target body');await expect(page.getByRole('status')).toHaveText('Saved locally');
 await add(page,'proof','proof:other');await page.getByRole('button',{name:'Insert cross-reference',exact:true}).click();await page.getByLabel('Reference target').selectOption(id);await apply(page);
 const ref=page.locator('.office-academic-reference');
 async function assertJump(){await ref.dblclick();await expect.poll(()=>page.evaluate(()=>{const n=getSelection()?.anchorNode;return (n?.nodeType===1?n:n?.parentElement)?.closest('.office-academic-block')?.getAttribute('data-academic-id')??null;})).toBe(id);}
 await assertJump();
 await blocks.first().locator('.office-academic-header').click();await page.getByRole('button',{name:'Edit academic block',exact:true}).click();await page.getByLabel('Academic label').fill('thm:renamed');await apply(page);
 await page.locator('.ProseMirror > p').first().click();await add(page,'definition','def:first');await expect(ref).toHaveText('Theorem 2');await page.reload();await expect(ref).toHaveText('Theorem 2');await assertJump();
 await blocks.nth(1).locator('.office-academic-header').click();await page.keyboard.press('Backspace');await expect(ref).toHaveText('[Unresolved reference]');await expect(page.getByRole('status')).toHaveText('Saved locally');
 await ref.dblclick();await expect(ref).toHaveClass(/ProseMirror-selectednode/);await expect(page.getByRole('button',{name:'Edit cross-reference',exact:true})).toBeEnabled();await expect(blocks.nth(0).locator('.office-academic-body')).not.toContainText('Target body');
});
