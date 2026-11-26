import {test,expect} from '@playwright/test';
test('conflict choices retain both histories, enforce reviewed snapshots, and roll back incompatible structured replacements',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {openAccountWorkspace}=await import('/assets/account-store.js');
  const {revise}=await import('/assets/model.js');
  const owner='a0000000-0000-4000-8000-000000000001';
  const s=await openAccountWorkspace({status:'signed-in',id:owner});
  const applied={push:async(_,op)=>({status:'applied',operationId:op.id,revision:op.doc.revision})};
  async function conflict(title,localPatch,remotePatch){
   const base=await s.add(title,'source');await s.flush(base.id,applied);
   const local=await s.save(base.id,base.revision,localPatch);
   const remote=revise(base,base.revision,remotePatch);
   await s.flush(base.id,{push:async(_,op)=>({status:'conflict',operationId:op.id,document:remote})});
   return {base,local,remote,row:await s.inspect(base.id)};
  }
  const rejected=async fn=>{try{await fn();return false;}catch{return true;}};
  try{
   const a=await conflict('keep remote',{body:'local A'},{body:'remote A'});
   const staleReview=await rejected(()=>s.resolveConflict(a.base.id,a.row,'remote',revise(a.remote,a.remote.revision,{body:'unreviewed'})));
   await s.resolveConflict(a.base.id,a.row,'remote',a.remote);
   const staleEditor=await rejected(()=>s.save(a.base.id,a.local.revision,{body:'stale editor'},a.local));
   const kept=await s.inspect(a.base.id);
   const b=await conflict('apply local',{body:'local B'},{body:'remote B'});
   await s.resolveConflict(b.base.id,b.row,'local',b.remote);const rebased=await s.inspect(b.base.id);
   const rich=source=>({version:1,originalMarkdown:source,content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:source}]}]}});
   const c=await conflict('structured',{rich:rich('source')},{body:'different source',rich:rich('different source')});
   const before=(await s.listArchives()).length;
   const incompatible=await rejected(()=>s.resolveConflict(c.base.id,c.row,'local',c.remote));
   const afterFailure=await s.inspect(c.base.id);
   const rollback=JSON.stringify(afterFailure)===JSON.stringify(c.row)&&(await s.listArchives()).length===before;
   const fork=await s.resolveConflict(c.base.id,c.row,'fork',c.remote);
   const copy=await s.inspect(fork.forkId),original=await s.inspect(c.base.id);
   const archives=await s.listArchives();
   const other=await openAccountWorkspace({status:'signed-in',id:'a0000000-0000-4000-8000-000000000002'});
   let isolated;try{isolated=(await other.listArchives()).length===0;}finally{other.close();}
   return {staleReview,staleEditor,kept,rebased,remoteB:b.remote,incompatible,rollback,copy,original,localC:c.local,remoteC:c.remote,archives,isolated};
  }finally{s.close();}
 });
 expect(result.staleReview).toBe(true);expect(result.staleEditor).toBe(true);
 expect(result.kept.doc.body).toBe('remote A');expect(result.kept.pending).toHaveLength(0);
 expect(result.rebased.doc.body).toBe('local B');expect(result.rebased.doc.revision).toBe(result.remoteB.revision+1);
 expect(result.rebased.doc.history.at(-1).body).toBe('remote B');expect(result.rebased.pending[0].expected).toBe(result.remoteB.revision);
 expect(result.incompatible).toBe(true);expect(result.rollback).toBe(true);
 expect(result.original.doc).toEqual(result.remoteC);expect(result.copy.doc.id).not.toBe(result.localC.id);
 expect(result.copy.doc.rich).toEqual(result.localC.rich);expect(result.copy.doc.history).toEqual(result.localC.history);
 expect(result.archives).toHaveLength(3);expect(result.archives.map(a=>a.choice).sort()).toEqual(['fork','local','remote']);
 expect(result.isolated).toBe(true);
});
