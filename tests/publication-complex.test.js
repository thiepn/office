import test from 'node:test';
import assert from 'node:assert/strict';
import {exportPublication} from '../assets/publication-format.js';
import {academicIndex,targetText} from '../assets/academic-format.js';
import {validateRich} from '../assets/rich-format.js';
import {complexFixture,mergedTable} from './publication-fixture.js';
const id='ab000000-0000-4000-8000-000000000006';
test('combined row and column spans preserve each cell exactly once and reject broken grids',()=>{
 const {tex,warnings}=exportPublication(complexFixture);assert.deepEqual(warnings,[]);
 assert.match(tex,/\\multirow\[t\]\{2\}/);assert.match(tex,/\\multicolumn\{2\}/);assert.match(tex,/\\cline\{3-3\}/);
 for(const s of ['Merged header','Second row','Wide cell'])assert.equal(tex.split(s).length,2);
 const bad=structuredClone(complexFixture);bad.content.content.find(n=>n.type==='table').content[0].content[0].attrs.rowspan=4;assert.throws(()=>exportPublication(bad),/span/);
});
test('equation UUID labels survive renumbering and unnumbering without accidental resolution',()=>{
 const doc=structuredClone(complexFixture);const eq=doc.content.content.find(n=>n.type==='displayEquation');assert.equal(targetText(academicIndex(doc.content).get(id)),'Equation (1)');
 doc.content.content.unshift({type:'displayEquation',attrs:{latex:'y=2',numbered:true}});
 assert.equal(targetText(academicIndex(doc.content).get(id)),'Equation (2)');
 let result=exportPublication(doc);assert.ok(result.tex.includes('\\label{eq:'+id+'}'));assert.ok(result.tex.includes('\\eqref{eq:'+id+'}'));
 eq.attrs.numbered=false;result=exportPublication(doc);assert.ok(result.warnings.some(w=>w.includes(id)));assert.ok(!result.tex.includes('\\label{eq:'+id+'}'));
 eq.attrs.numbered=true;doc.content.content.unshift(structuredClone(eq));assert.throws(()=>validateRich(doc),/Duplicate/);
});
