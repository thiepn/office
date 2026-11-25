import test from 'node:test';
import assert from 'node:assert/strict';
import {create,revise,selectDocuments,Conflict,filename} from '../assets/model.js';
test('CAS, history and no-op revisions',()=>{const d=create('id','Notes','a','2026-01-01');const n=revise(d,0,{body:'b'},'2026-01-02');assert.equal(n.id,'id');assert.equal(n.revision,1);assert.equal(n.history[0].body,'a');assert.equal(revise(n,1,{body:'b'}),n);assert.throws(()=>revise(n,0,{body:'stale'}),Conflict);assert.equal(d.body,'a');});
test('trash is reversible and search excludes trash',()=>{const d=create('a','Math','Probability');const t=revise(d,0,{trashed:true});assert.equal(selectDocuments([t]).length,0);assert.equal(selectDocuments([t],{trash:true,query:'probability'}).length,1);assert.equal(revise(t,1,{trashed:false}).id,'a');});
test('bounded validation and history',()=>{assert.throws(()=>create('a',' ','x'));assert.throws(()=>create('a','x','a'.repeat(200001)));let d=create('a');for(let i=0;i<20;i++)d=revise(d,d.revision,{body:String(i)});assert.equal(d.history.length,12);assert.equal(d.revision,20);assert.equal(filename('a/b'),'a-b.md');});
