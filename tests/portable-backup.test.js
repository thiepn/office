import test from 'node:test';
import assert from 'node:assert/strict';
import {create,revise} from '../assets/model.js';
import {createPortableBackup,verifyPortableBackup,migrationPlan,makeBatch,validateBatchReceipt,parsePortableBackup,fingerprint} from '../assets/portable-backup.js';
import {exportSelectedHubScope} from '../assets/hub-export.js';
const A='a0000000-0000-4000-8000-000000000001',B='a0000000-0000-4000-8000-000000000002',S='user:'+A;
const hub={schemaVersion:1,id:'hub-record',title:'Hub',body:'New **Markdown**\n한글',revision:2,updatedAt:'2026-01-02T00:00:00Z',history:[{revision:1,title:'Before',body:'Original\r\n',updatedAt:'2026-01-01T00:00:00Z'}]};
test('Hub export selects explicit verified scope, preserves original record and hashes each revision',async()=>{
 let reads=0;const store={scope:S,list:async()=>{reads++;return [hub];}};
 await assert.rejects(exportSelectedHubScope(store,S,{status:'signed-in',id:B},S));assert.equal(reads,0);
 const backup=await exportSelectedHubScope(store,S,{status:'signed-in',id:A},S);assert.equal(reads,1);
 assert.deepEqual(backup.records,[hub]);assert.equal(backup.fingerprints[0].history[0].sha256,await fingerprint(hub.history[0]));
 const verified=await parsePortableBackup(JSON.stringify(backup));assert.equal(verified.documents[0].id,hub.id);assert.equal(verified.documents[0].history[0].body,'Original\r\n');assert.equal(verified.documents[0].createdAt,hub.history[0].updatedAt);
});
test('portable backup detects document, revision, manifest and ownership tampering',async()=>{
 const backup=await createPortableBackup('hub',S,[hub]);
 for(const mutate of [x=>x.records[0].body='changed',x=>x.records[0].history[0].body='changed',x=>x.fingerprints[0].document='0'.repeat(64),x=>x.scope='user:'+B]){const x=structuredClone(backup);mutate(x);await assert.rejects(verifyPortableBackup(x),/fingerprint/);}
 await assert.rejects(migrationPlan(backup,B,'user:'+B),/match/);await assert.rejects(migrationPlan(backup,A,'guest'),/Confirm/);
 const p=await migrationPlan(backup,A,S,[hub.id],[hub.id]);assert.deepEqual(p.collisions,[{id:hub.id,local:true,cloud:true}]);await assert.rejects(makeBatch(p),/collisions/);
});
test('Office portable restore preserves structured content, original source and exact revision history',async()=>{
 const source='Original Markdown',rich={version:1,originalMarkdown:source,content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Edited'}]}]}};
 const d=revise(create('structured','Title',source),0,{rich});
 const b=await createPortableBackup('office',S,[d]);const verified=await verifyPortableBackup(b);assert.deepEqual(verified.documents,[d]);
 const plan=await migrationPlan(b,A,S);const batch=await makeBatch(plan);assert.deepEqual(batch.documents,[d]);
 assert.equal(validateBatchReceipt({status:'applied',batchId:batch.id,documents:[{id:d.id,revision:d.revision}]},batch).status,'applied');
 assert.throws(()=>validateBatchReceipt({status:'applied',batchId:batch.id,documents:[{id:d.id,revision:0}]},batch));
});
