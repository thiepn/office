import {test,expect} from '@playwright/test';
test('SDK session-changed signal locks workspace instead of treating it as offline',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {workspaceSession}=await import('/assets/workspace-session.js');
  const A='a0000000-0000-4000-8000-000000000001';
  let identity={status:'signed-in',id:A},listener,locks=0;
  const session={identity:()=>identity,verify:async()=>{listener?.(identity);return identity;},subscribe(fn){listener=fn;fn(identity);return()=>{};}};
  const controller=workspaceSession({session,disconnect:async()=>{}},{onLock:()=>{locks++;}});
  const store=await controller.verify();await store.add('Private','retained');
  identity={status:'unavailable',code:'ACCOUNT_VERIFY_UNAVAILABLE'};await controller.verify();
  const offline=controller.store===store&&controller.state==='offline';
  identity={status:'unavailable',code:'ACCOUNT_SESSION_CHANGED'};await controller.verify();
  const locked=controller.state==='locked'&&controller.store===null&&controller.owner===null;
  identity={status:'signed-in',id:A};const reopen=await controller.verify();
  return {offline,locked,locks,reopen};
 });
 expect(result).toEqual({offline:true,locked:true,locks:1,reopen:null});
});
