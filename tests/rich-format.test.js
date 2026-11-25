import test from 'node:test';
import assert from 'node:assert/strict';
import {create,revise,Conflict} from '../assets/model.js';
import {safeLink,validateRich} from '../assets/rich-format.js';
const envelope=(text='original')=>({version:1,originalMarkdown:'original',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]}});
test('explicit conversion retains original source, id and history and uses CAS',()=>{
 const d=create('original-id','Title','original');const n=revise(d,0,{rich:envelope()});
 assert.equal(n.id,d.id);assert.equal(n.body,d.body);assert.deepEqual(n.history[0],{revision:0,title:d.title,body:d.body,updatedAt:d.updatedAt,trashed:false});
 const next=revise(n,1,{rich:envelope('changed')});assert.equal(next.history[1].rich.content.content[0].content[0].text,'original');
 assert.throws(()=>revise(next,1,{rich:envelope('stale')}),Conflict);
 assert.throws(()=>revise(next,2,{body:'overwritten'}));assert.equal(revise(next,2,{rich:next.rich}),next);
});
test('reject unsafe links, unsupported schema versions and bounded content',()=>{
 assert.equal(safeLink('javascript:alert(1)'),false);assert.equal(safeLink('https://example.com'),true);
 assert.throws(()=>validateRich({...envelope(),version:2}));
 const r=envelope();r.content.content[0].content[0].marks=[{type:'link',attrs:{href:'javascript:alert(1)'}}];assert.throws(()=>validateRich(r));
 assert.throws(()=>validateRich(envelope('x'.repeat(200001))));
});
