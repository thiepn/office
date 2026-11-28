import test from 'node:test';
import assert from 'node:assert/strict';
import {exportPublication,publicationMath,texText,PUBLICATION_TEMPLATES} from '../assets/publication-format.js';
import {fixture} from './publication-fixture.js';
const id=n=>'ab000000-0000-4000-8000-'+String(n).padStart(12,'0');
const ref=n=>({type:'academicReference',attrs:{targetId:id(n)}}),cite=n=>({type:'researchCitation',attrs:{sourceId:id(n)}});
test('all publication templates are standalone, with native theorem counters, stable targets, first-use citations and numbered equations',()=>{
 for(const template of Object.keys(PUBLICATION_TEMPLATES)){
  const {tex,warnings}=exportPublication(fixture,{title:'A & B',author:'Ada',template,abstract:'Summary.'});
  assert.deepEqual(warnings,[]);assert.match(tex,/\\begin\{document\}/);assert.match(tex,/\\end\{document\}\n$/);assert.ok(tex.includes('\\title{A \\& B}'));
  assert.ok(tex.includes('\\label{office:'+id(1)+'}'));assert.ok(tex.includes('\\ref{office:'+id(1)+'}'));assert.ok(tex.includes('\\hyperlink{office:'+id(2)+'}'));assert.ok(tex.includes('\\begin{equation*}'));
  assert.ok(tex.indexOf('\\bibitem{cite:'+id(4))<tex.indexOf('\\bibitem{cite:'+id(3)));assert.ok(!tex.includes('Paper 5'));
 }
});
test('stable identity survives label rename, missing targets are explicit and export never mutates the document',()=>{
 const x=structuredClone(fixture);x.content.content[2].attrs.label='renamed';x.content.content[1].content.push(ref(99),cite(98));const before=JSON.stringify(x);
 const {tex,warnings}=exportPublication(x);assert.ok(tex.includes('\\ref{office:'+id(1)+'}'));assert.ok(tex.includes('[Unresolved reference]'));assert.ok(tex.includes('[Missing citation]'));assert.equal(warnings.length,2);assert.equal(JSON.stringify(x),before);
});
test('publication equation boundary rejects executable commands, token rewriting, unknown environments and unbalanced math',()=>{
 for(const v of ['\\input{secret}','\\openin1=secret','\\csname input\\endcsname','\\write18{bad}','^^5cinput','% comment','\\begin{document}x\\end{document}','\\end{aligned}','\\frac{1}{2','x&y','\\color{red}x'])assert.throws(()=>publicationMath(v),v);
 assert.equal(publicationMath('\\begin{aligned}x&=1\\\\y&=2\\end{aligned}'),'\\begin{aligned}x&=1\\\\y&=2\\end{aligned}');
 assert.equal(texText('\\input{a} % # &'),'\\textbackslash{}input\\{a\\} \\% \\# \\&');
});
