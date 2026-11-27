import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEquation,equationInventory,equationSourceExport} from '../assets/equation-format.js';
import {validateRich,richText,parseStructuredFile} from '../assets/rich-format.js';
import {create,revise,selectDocuments} from '../assets/model.js';
import {validateSyncDocument} from '../assets/sync-contract.js';
import {createPortableBackup,verifyPortableBackup} from '../assets/portable-backup.js';
const inline=latex=>({type:'inlineEquation',attrs:{latex}}),display=(latex,numbered=true)=>({type:'displayEquation',attrs:{latex,numbered}}),para=(...content)=>({type:'paragraph',content});
const envelope=content=>({version:1,originalMarkdown:'Original source',content:{type:'doc',content}});
const original=envelope([para({type:'text',text:'Let '},inline('x^2')),display('\\int_0^1 x\\,dx'),display('a=b',false),display('\\frac{1}{2}')]);
test('equation source contract preserves exact LaTeX and derives numbering without storing numbers',()=>{
 validateRich(original);
 assert.deepEqual(equationInventory(original.content).map(e=>e.number),[null,1,null,2]);
 const reordered=envelope([original.content.content[3],original.content.content[0],original.content.content[1]]);
 assert.deepEqual(equationInventory(reordered.content).map(e=>e.number),[1,null,2]);
 assert.match(equationSourceExport(original.content),/Equation \(2\)/);
 assert.ok(equationSourceExport(original.content).includes('\\frac{1}{2}'));
 assert.ok(richText(original.content).includes('\\(x^2\\)'));
});
test('equation validation denies unsafe commands, forged numbering, invalid placement and oversized source',()=>{
 for(const latex of ['','  ','\\href{https://example.com}{x}','\\includegraphics{a}','\\gdef\\x{x}','\\tag{99}','\\label{x}','a\u0000b','é'.repeat(1025)])assert.throws(()=>validateEquation('inlineEquation',{latex}));
 assert.throws(()=>validateRich(envelope([inline('x')])));
 assert.throws(()=>validateRich(envelope([para(display('x'))])));
 assert.throws(()=>validateRich(envelope([display('x',1)])));
 assert.throws(()=>validateRich(envelope([{...display('x'),attrs:{latex:'x',numbered:true,number:4}}])));
 assert.throws(()=>validateRich(envelope(Array.from({length:129},()=>display('x')))));
 assert.throws(()=>validateRich(envelope([{...display('x'),content:[]}])));assert.throws(()=>validateEquation('inlineEquation',{latex:'x\n+y'}));
});
test('equations survive CAS history, structured exchange, search and portable backup',async()=>{
 const first=create('equations','Proof',original.originalMarkdown,'2026-01-01T00:00:00Z',original);
 const changed=structuredClone(original);changed.content.content[1].attrs.latex='\\sum_{i=1}^n i';
 const next=revise(first,0,{rich:changed},'2026-01-02T00:00:00Z');
 validateSyncDocument(next);assert.deepEqual(next.history[0].rich,original);assert.equal(next.body,original.originalMarkdown);
 assert.deepEqual(parseStructuredFile(JSON.stringify({kind:'thiepn-office-structured',title:next.title,rich:next.rich})).rich,changed);
 assert.equal(selectDocuments([next],{query:'sum_'}).length,1);
 const backup=await createPortableBackup('office','user:a0000000-0000-4000-8000-000000000001',[next]);
 assert.deepEqual((await verifyPortableBackup(backup)).documents,[next]);
});
