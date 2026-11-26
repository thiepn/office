import {test,expect} from '@playwright/test';
test('migration journal survives reopen, rejects overlap and reconciles atomically without overwriting local edits',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {openAccountWorkspace}=await import('/assets/account-store.js');
  const {createPortableBackup,migrationPlan,makeBatch}=await import('/assets/portable-backup.js');
  const {beginMigration,resumeMigration}=await import('/assets/migration-recovery.js');
  const {create,revise}=await import('/assets/model.js');
  const A='a0000000-0000-4000-8000-000000000001',B='a0000000-0000-4000-8000-000000000002',identity={status:'signed-in',id:A};
  let s=await openAccountWorkspace(identity);
  const d=revise(create('migration-one','One','old'),0,{body:'new'}),e=create('migration-two','Two','second');
  const backup=await createPortableBackup('office','user:'+A,[d,e]);
  const batch=await makeBatch(await migrationPlan(backup,A,'user:'+A));
  await beginMigration(s,batch);
  let overlap=false;try{await beginMigration(s,{...batch,id:crypto.randomUUID()});}catch{overlap=true;}
  let calls=[];const transport={importBatch:async(_,value)=>{calls.push(JSON.stringify(value));if(calls.length===1)throw Error('ack lost');return {status:'applied',batchId:value.id,documents:value.documents.map(d=>({id:d.id,revision:d.revision}))};}};
  try{await resumeMigration(s,transport,batch.id);}catch{}
  s.close();s=await openAccountWorkspace(identity);
  const pending=(await s.getMigration(batch.id)).state==='pending';
  const other=await openAccountWorkspace({status:'signed-in',id:B});let isolated;try{isolated=(await other.listMigrations()).length===0;}finally{other.close();}
  const done=await resumeMigration(s,transport,batch.id);const exact=JSON.stringify(await s.get(d.id))===JSON.stringify(d)&&JSON.stringify(await s.get(e.id))===JSON.stringify(e);
  const clean=(await s.inspect(d.id)).pending.length===0;
  const x=create('migration-three','Three','source'),y=create('migration-four','Four','source');
  const badBatch=await makeBatch(await migrationPlan(await createPortableBackup('office','user:'+A,[x,y]),A,'user:'+A));
  await beginMigration(s,badBatch);await s.importMissing([{...y,body:'local edit'}]);
  let rejected=false;try{await resumeMigration(s,transport,badBatch.id);}catch{rejected=true;}
  const rollback=!(await s.get(x.id))&&(await s.get(y.id)).body==='local edit'&&(await s.getMigration(badBatch.id)).state==='pending';
  s.close();return {overlap,pending,isolated,identical:calls[0]===calls[1],done:done.state,exact,clean,rejected,rollback};
 });expect(result).toEqual({overlap:true,pending:true,isolated:true,identical:true,done:'applied',exact:true,clean:true,rejected:true,rollback:true});
});
