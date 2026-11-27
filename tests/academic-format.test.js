import test from 'node:test';
import assert from 'node:assert/strict';
import {academicIndex,targetText,ACADEMIC_KINDS} from '../assets/academic-format.js';
import {validateRich,richText,parseStructuredFile} from '../assets/rich-format.js';
import {create,revise} from '../assets/model.js';
import {validateSyncDocument} from '../assets/sync-contract.js';
import {createPortableBackup,verifyPortableBackup} from '../assets/portable-backup.js';
const id=n=>'ab000000-0000-4000-8000-'+String(n).padStart(12,'0');
const para=(...content)=>({type:'paragraph',...(content.length?{content}:{})}),ref=n=>({type:'academicReference',attrs:{targetId:id(n)}}),block=(n,kind,label,...content)=>({type:'academicBlock',attrs:{id:id(n),kind,label},content:content.length?content:[para()]});
const rich=(...content)=>({version:1,originalMarkdown:'Original source',content:{type:'doc',content}});
test('all six academic kinds share one statement counter; proof is unnumbered; reference identities survive reorder and rename',()=>{
 const blocks=ACADEMIC_KINDS.map((k,i)=>block(i+1,k,k));
 const r=rich(...blocks,para(ref(2),ref(6)));validateRich(r);
 assert.deepEqual([...academicIndex(r.content).values()].map(x=>x.number),[1,2,3,4,5,null]);
 const reordered=rich(block(2,'theorem','renamed'),blocks[0],blocks[5],para(ref(2),ref(6),ref(99)));
 validateRich(reordered);const idx=academicIndex(reordered.content);
 assert.equal(targetText(idx.get(id(2))),'Theorem 1');assert.equal(idx.get(id(2)).label,'renamed');
 assert.equal(targetText(idx.get(id(99))),'[Unresolved reference]');
 assert.match(richText(reordered.content),/Theorem 1/);assert.match(richText(reordered.content),/Unresolved reference/);
});
test('academic contract rejects duplicate IDs and labels, malformed attributes, nesting, empty bodies and misplaced references',()=>{
 const a=block(1,'theorem','thm:one');
 for(const r of [rich(a,a),rich(a,block(2,'lemma','thm:one')),rich({...a,attrs:{...a.attrs,number:3}}),rich({...a,attrs:{...a.attrs,id:'bad'}}),rich({...a,attrs:{...a.attrs,label:'<script>'}}),rich({...a,content:[]}),rich({...a,content:[{type:'heading',attrs:{level:1}}]}),rich(block(3,'proof','proof:one',para(),a)),rich(ref(1)),rich(para({...ref(1),content:[]})),rich(para({...ref(1),attrs:{targetId:'not-a-uuid'}})),rich(...Array.from({length:257},(_,i)=>block(i,'lemma','l'+i))),rich(para(...Array.from({length:1025},()=>ref(1))))])assert.throws(()=>validateRich(r));
 validateRich(rich(para(ref(99))));
});
test('academic blocks, equations and references survive revision history, structured exchange and exact portable backup',async()=>{
 const original=rich(block(1,'theorem','thm:one',para({type:'inlineEquation',attrs:{latex:'x^2'}}),{type:'displayEquation',attrs:{latex:'x=x',numbered:true}}),block(2,'proof','proof:one',para(ref(1))));
 const d=create('academic','Academic',original.originalMarkdown,'2026-01-01T00:00:00Z',original);
 const changed=structuredClone(original);changed.content.content[0].attrs.label='thm:renamed';
 const next=revise(d,0,{rich:changed},'2026-01-02T00:00:00Z');validateSyncDocument(next);
 assert.deepEqual(next.history[0].rich,original);
 assert.deepEqual(parseStructuredFile(JSON.stringify({kind:'thiepn-office-structured',title:next.title,rich:next.rich})).rich,changed);
 const backup=await createPortableBackup('office','user:a0000000-0000-4000-8000-000000000001',[next]);
 assert.deepEqual((await verifyPortableBackup(backup)).documents,[next]);
});
