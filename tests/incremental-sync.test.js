import test from 'node:test';
import assert from 'node:assert/strict';
import {validateManifest} from '../assets/sync-contract.js';
import {synchronizeWorkspace} from '../assets/incremental-sync.js';
import {create,revise} from '../assets/model.js';
test('bounded discovery validates IDs, revisions and duplicate entries',()=>{
 assert.deepEqual(validateManifest([{id:'doc',revision:0}]),[{id:'doc',revision:0}]);
 for(const x of [[{id:'doc',revision:-1}],[{id:'doc',revision:0},{id:'doc',revision:1}],[{id:'bad/id',revision:0}],Array.from({length:101},(_,i)=>({id:'d'+i,revision:0}))])assert.throws(()=>validateManifest(x));
});
test('incremental sync downloads only unknown and newer records and can resume after interruption',async()=>{
 const a=create('a','A','A'),b=create('b','B','B'),c=create('c','C','C'),next=revise(b,0,{body:'updated'});const rows=new Map([[a.id,{doc:a,pending:[],remoteRevision:0}],[b.id,{doc:b,pending:[],remoteRevision:0}]]);let calls=[],fail=true;
 const store={owner:'test',list:async()=>[...rows.values()].map(r=>r.doc),inspect:async id=>rows.get(id),acceptRemote:async doc=>rows.set(doc.id,{doc,pending:[],remoteRevision:doc.revision})};
 const transport={manifest:async()=>[{id:'a',revision:0},{id:'b',revision:1},{id:'c',revision:0}],pull:async(_,id)=>{calls.push(id);if(id==='c'&&fail)throw Error('interrupted');return id==='b'?next:c;}};
 await assert.rejects(synchronizeWorkspace(store,transport),/interrupted/);assert.equal(rows.get('b').doc.body,'updated');fail=false;await synchronizeWorkspace(store,transport);assert.deepEqual(calls,['b','c','c']);assert.equal(rows.get('c').doc.body,'C');
});
