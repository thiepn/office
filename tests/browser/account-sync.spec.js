import {test,expect} from '@playwright/test';
test('account-scoped offline queue persists, retries same operation and keeps conflict copies',async({page})=>{
 await page.goto('/');const result=await page.evaluate(async()=>{
  const {openAccountWorkspace}=await import('/assets/account-store.js');
  const a={status:'signed-in',id:'a0000000-0000-4000-8000-000000000001'},b={status:'signed-in',id:'a0000000-0000-4000-8000-000000000002'};
  let x=await openAccountWorkspace(a),y=await openAccountWorkspace(b);const d=await x.add('Private','source');await x.save(d.id,0,{body:'offline'});const isolated=(await y.list()).length===0&&!(await y.get(d.id));const op=(await x.inspect(d.id)).pending[0].id;x.close();x=await openAccountWorkspace(a);let retained=false;
  try{await x.flush(d.id,{push:async()=>{throw Error('offline');}});}catch{retained=(await x.inspect(d.id)).pending[0].id===op;}
  await x.flush(d.id,{push:async(owner,o)=>({status:'applied',operationId:o.id,revision:o.doc.revision})});
  await x.flush(d.id,{push:async(owner,o)=>({status:'conflict',operationId:o.id,document:{...d,body:'remote'}})});
  const row=await x.inspect(d.id);x.close();y.close();return {isolated,retained,local:row.doc.body,remote:row.conflict.document.body,pending:row.pending.length};
 });expect(result).toEqual({isolated:true,retained:true,local:'offline',remote:'remote',pending:1});
});
test('account import batch is atomic, guest database remains unchanged',async({page})=>{
 await page.goto('/');const result=await page.evaluate(async()=>{
  const {openAccountWorkspace}=await import('/assets/account-store.js');const {openOffice}=await import('/assets/store.js');const {create}=await import('/assets/model.js');
  const guest=await openOffice(),g=await guest.add('Guest','guest');const x=await openAccountWorkspace({status:'signed-in',id:'a0000000-0000-4000-8000-000000000001'});const d=create('one','One','first');await x.importMissing([d]);let rejected=false;
  try{await x.importMissing([create('two','Two','second'),d]);}catch{rejected=true;}
  const rows=await x.list(),unchanged=(await guest.get(g.id)).body;x.close();guest.db.close();return {rejected,count:rows.length,unchanged};
 });expect(result).toEqual({rejected:true,count:1,unchanged:'guest'});
});
