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
test('academic block bodies, stable cross-references, rename, renumber, missing target and export survive reload',async({page})=>{
 await create(page);await page.locator('.ProseMirror > p').first().click();
 await add(page,'theorem','thm:main');const blocks=page.locator('.ProseMirror .office-academic-block');
 await expect(blocks).toHaveCount(1);const target=await blocks.first().getAttribute('data-academic-id');
 await page.keyboard.type('A theorem.');
 await expect(page.getByRole('status')).toHaveText('Saved locally');
 await add(page,'lemma','lem:next');await expect(blocks).toHaveCount(2);
 await add(page,'proof','proof:main');await expect(blocks).toHaveCount(3);
 await expect(blocks.locator('.office-academic-caption')).toHaveText(['Theorem 1','Lemma 2','Proof [proof:main]']);
 await page.getByRole('button',{name:'Insert cross-reference',exact:true}).click();await page.getByLabel('Reference target').selectOption(target);await apply(page);
 const ref=page.locator('.ProseMirror .office-academic-reference');await expect(ref).toHaveText('Theorem 1');
 await blocks.first().locator('.office-academic-header').click();await page.getByRole('button',{name:'Edit academic block',exact:true}).click();await page.getByLabel('Academic label').fill('thm:renamed');await page.getByLabel('Academic block kind').selectOption('proposition');await apply(page);
 await expect(blocks.first()).toHaveAttribute('data-academic-id',target);await expect(ref).toHaveText('Proposition 1');
 await page.locator('.ProseMirror > p').first().click();await add(page,'definition','def:first');
 await expect(blocks.locator('.office-academic-caption')).toHaveText(['Definition 1','Proposition 2','Lemma 3','Proof [proof:main]']);await expect(ref).toHaveText('Proposition 2');
 await page.reload();await expect(ref).toHaveText('Proposition 2');await expect(blocks.nth(1).locator('.office-academic-body')).toContainText('A theorem.');
 const dl=page.waitForEvent('download');await page.getByRole('button',{name:'Export structured JSON'}).click();const json=JSON.parse(await readFile(await (await dl).path(),'utf8'));
 expect(json.rich.originalMarkdown).toBe('Original source');const statement=json.rich.content.content.find(n=>n.attrs?.id===target);expect(statement.attrs).toEqual({id:target,kind:'proposition',label:'thm:renamed'});expect(JSON.stringify(json.rich.content)).toContain('"targetId":"'+target+'"');
 await blocks.nth(1).locator('.office-academic-header').click();await page.keyboard.press('Backspace');await expect(blocks).toHaveCount(3);await expect(ref).toHaveText('[Unresolved reference]');await expect(page.getByRole('status')).toHaveText('Saved locally');
 await page.reload();await expect(ref).toHaveText('[Unresolved reference]');
 await ref.click();await page.getByRole('button',{name:'Edit cross-reference',exact:true}).click();const lemma=await blocks.nth(1).getAttribute('data-academic-id');await page.getByLabel('Reference target').selectOption(lemma);await apply(page);await expect(ref).toHaveText('Lemma 2');
});
test('duplicate academic labels rejected and cancel does not modify the document',async({page})=>{
 await create(page);await add(page,'corollary','cor:one');
 await page.getByRole('button',{name:'Insert academic block',exact:true}).click();await page.getByLabel('Academic label').fill('cor:one');await expect(page.getByRole('button',{name:'Apply academic structure'})).toBeDisabled();
 await expect(page.getByText('This label is already used.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Cancel academic structure'}).click();await expect(page.locator('.office-academic-block')).toHaveCount(1);await expect(page.getByRole('status')).toHaveText('Saved locally');
});
