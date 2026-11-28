import {test,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {prepareRelease,headers,releaseFiles} from '../../scripts/prepare-release.mjs';
test('O6 packaged guest release writes, reloads and respects disabled account at phone viewport',async({page})=>{
 const root=await mkdtemp(join(tmpdir(),'office-static-browser-')),out=join(root,'static');
 let server;
 try{
  await prepareRelease({destination:out,sha:'a'.repeat(40)});
  const files=new Set([...releaseFiles,'release.json']);
  server=createServer(async(req,res)=>{
   try{
    const path=new URL(req.url,'http://localhost').pathname.replace(/^\//,'');
    const file=path===''?'index.html':path.endsWith('/')?path+'index.html':path;
    if(!files.has(file)){res.writeHead(404);res.end();return;}
    for(const line of headers.split('\n').slice(1).filter(Boolean)){const i=line.indexOf(':');res.setHeader(line.slice(0,i).trim(),line.slice(i+1).trim());}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html');
    res.end(await readFile(join(out,file)));
   }catch{res.writeHead(500);res.end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin='http://127.0.0.1:'+server.address().port;
  await page.setViewportSize({width:390,height:844});await page.goto(origin+'/');
  await expect(page.getByRole('button',{name:'Connect THIEPN Account'})).toBeDisabled();
  await page.getByRole('button',{name:'New document'}).click();await page.getByLabel('Document (Markdown)').fill('Mobile academic draft');
  await expect(page.getByRole('status')).toHaveText('Saved locally');await page.reload();await expect(page.getByLabel('Document (Markdown)')).toHaveValue('Mobile academic draft');
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Upgrade to structured document'}).click();await expect(page.getByRole('textbox',{name:'Visual document'})).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Saved locally');
  await page.goto(origin+'/?workspace=account');await expect(page.getByText('Account activation is disabled. Return to the guest workspace.')).toBeVisible();
  const forbidden=await page.request.get(origin+'/server/release/disable-office.sql');expect(forbidden.status()).toBe(404);
  await page.goto(origin+'/auth/callback/?code=synthetic&state=synthetic');await expect(page.locator('#callback-state')).toHaveText('Account activation is disabled. No authorization code was exchanged.');expect(page.url()).toBe(origin+'/auth/callback/');
 }finally{if(server){await new Promise(resolve=>server.close(resolve));}await rm(root,{recursive:true,force:true});}
});
