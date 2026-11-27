import test from 'node:test';
import assert from 'node:assert/strict';
import {researchIndex,validateSource,parseBibTeX,exportBibTeX,citationText,bibliographyText} from '../assets/research-format.js';
import {validateRich,richText,parseStructuredFile} from '../assets/rich-format.js';
import {create,revise} from '../assets/model.js';
import {validateSyncDocument} from '../assets/sync-contract.js';
import {createPortableBackup,verifyPortableBackup} from '../assets/portable-backup.js';
const id=n=>'ab000000-0000-4000-8000-'+String(n).padStart(12,'0');
const source=(n,key,title)=>({id:id(n),type:'article',key,fields:{author:'Ada Lovelace',title,year:'1843'}});
const citation=n=>({type:'researchCitation',attrs:{sourceId:id(n)}}),paragraph=(...content)=>({type:'paragraph',...(content.length?{content}:{})}),catalog=sources=>({type:'researchCatalog',attrs:{sources}});
const rich=(...content)=>({version:1,originalMarkdown:'Original source',content:{type:'doc',content}});
test('citation order is first use, repeated citations share a number, missing targets never silently resolve',()=>{
 const a=source(1,'alpha','First'),b=source(2,'beta','Second'),c=source(3,'unused','Unused');
 const d=rich(paragraph(citation(2),citation(1),citation(2),citation(99)),catalog([a,b,c]));validateRich(d);
 const idx=researchIndex(d.content);
 assert.deepEqual(idx.ordered,[b.id,a.id]);assert.equal(citationText(idx,b.id),'[1]');assert.equal(citationText(idx,id(99)),'[Missing citation]');
 assert.match(bibliographyText(idx),/Second[\s\S]*First/);assert.doesNotMatch(bibliographyText(idx),/Unused/);
 const changed=rich(paragraph(citation(1),citation(2)),catalog([{...a,key:'renamed'},b]));validateRich(changed);
 assert.equal(citationText(researchIndex(changed.content),a.id),'[1]');
});
test('bounded BibTeX literal roundtrip preserves nested braces, quoted fields, numeric fields and rejects unsupported constructs atomically',()=>{
 let n=0;const raw='@article{ada, author = "Lovelace, Ada", title = {On {Numbers}}, year = 1843, pages = {1--4}}\n@book{book, title = {A book}, publisher = {Press}}';
 const parsed=parseBibTeX(raw,()=>id(++n));assert.equal(parsed[0].fields.title,'On {Numbers}');assert.equal(parsed[0].fields.year,'1843');n=0;assert.deepEqual(parseBibTeX(exportBibTeX(parsed),()=>id(++n)),parsed);
 for(const bad of ['@string{foo="bar"}','@article{x,title=foo}','@article{x,title={a} # {b}}','@article{x,title={a}, unknown={b}}','@article{x,title={a}, title={b}}','@article{x,title={a}} @article{x,title={b}}','@article{x,title={a}','@article{x,author={a}}'])assert.throws(()=>parseBibTeX(bad,()=>id(++n)));
 const a=source(1,'alpha','First');for(const d of [rich(catalog([a,a])),rich(catalog([a,{...a,id:id(2)}])),rich(catalog([a]),catalog([])),rich(citation(1)),rich(paragraph({...citation(1),attrs:{sourceId:id(1),number:1}})),rich(catalog([{...a,fields:{title:'{unbalanced'}}])),rich({type:'blockquote',content:[catalog([a])]}),rich(paragraph(...Array.from({length:1025},()=>citation(1))))])assert.throws(()=>validateRich(d));
});
test('research metadata and unresolved citations roundtrip through history, structured exchange, backup and sync validation',async()=>{
 const a=source(1,'alpha','First'),original=rich(paragraph(citation(1),citation(99),{type:'inlineEquation',attrs:{latex:'x^2'}}),catalog([a]));
 const d=create('research','Research',original.originalMarkdown,'2026-01-01T00:00:00Z',original),changed=rich(paragraph(citation(1),citation(99)),catalog([{...a,key:'renamed'}]));
 const next=revise(d,0,{rich:changed},'2026-01-02T00:00:00Z');validateSyncDocument(next);assert.deepEqual(next.history[0].rich,original);assert.match(richText(next.rich.content),/Missing citation/);
 assert.deepEqual(parseStructuredFile(JSON.stringify({kind:'thiepn-office-structured',title:next.title,rich:next.rich})).rich,changed);
 const backup=await createPortableBackup('office','user:a0000000-0000-4000-8000-000000000001',[next]);assert.deepEqual((await verifyPortableBackup(backup)).documents,[next]);
});
