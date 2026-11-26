import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRich,parseStructuredFile} from '../assets/rich-format.js';
import {validateLayout,pageWidth} from '../assets/authoring-format.js';
const rich={version:1,originalMarkdown:'Source',layout:{paper:'Letter',orientation:'landscape',margin:25},content:{type:'doc',content:[{type:'paragraph',attrs:{officeAlign:'center',officeSpacing:1.5},content:[{type:'text',text:'Current',marks:[{type:'typography',attrs:{font:'sans',size:18,color:'blue'}}]}]}]}};
test('typography and page layout validate and exchange preserves original source',()=>{const x=parseStructuredFile(JSON.stringify({kind:'thiepn-office-structured',title:'Report',rich}));assert.deepEqual(x.rich,rich);assert.equal(pageWidth(x.rich.layout),279.4);});
test('reject arbitrary style, unsupported page attributes, unknown fields and malformed exchange',()=>{const bad=structuredClone(rich);bad.content.content[0].content[0].marks[0].attrs.color='url(https://example.com)';assert.throws(()=>validateRich(bad));assert.throws(()=>validateLayout({paper:'A4; color:red',orientation:'portrait',margin:20}));assert.throws(()=>validateRich({...rich,extra:'bad'}));assert.throws(()=>parseStructuredFile('{"kind":"bad"}'));});
