import {test,expect} from '@playwright/test';
test('O6 guest writing and saved reload at phone viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await expect(page.getByRole('button',{name:'Connect THIEPN Account'})).toBeDisabled();
 await page.getByRole('button',{name:'New document'}).click();await page.getByLabel('Document (Markdown)').fill('Mobile academic draft');
 await expect(page.getByRole('status')).toHaveText('Saved locally');await page.reload();await expect(page.getByLabel('Document (Markdown)')).toHaveValue('Mobile academic draft');
});
