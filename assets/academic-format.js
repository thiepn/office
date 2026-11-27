// Stable semantic targets; display numbers are derived, never persisted.
import {validateEquation} from './equation-format.js';
export const ACADEMIC_KINDS=Object.freeze(['definition','theorem','lemma','proposition','corollary','proof']);
export const BLOCK_LIMIT=256,REFERENCE_LIMIT=1024;
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const labelPattern=/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/;
export const kindName=k=>k[0].toUpperCase()+k.slice(1);
export function validateAcademicAttrs(type,a){
 if(!a||typeof a!=='object'||Array.isArray(a))throw Error('Invalid academic attributes.');
 if(type==='academicBlock'){
  if(Object.keys(a).sort().join(',')!=='id,kind,label'||typeof a.id!=='string'||!idPattern.test(a.id)||!ACADEMIC_KINDS.includes(a.kind)||typeof a.label!=='string'||!labelPattern.test(a.label))throw Error('Invalid academic block ID, kind or label.');
 }else if(type==='academicReference'){
  if(Object.keys(a).join(',')!=='targetId'||typeof a.targetId!=='string'||!idPattern.test(a.targetId))throw Error('Invalid academic reference target.');
 }else throw Error('Unknown academic type.');
 return a;
}
export function academicIndex(root){
 const targets=new Map(),labels=new Set(),ids=new Set();let number=0,refs=0,equationNumber=0,blocks=0;
 function walk(n,parent){
  if(n.type==='academicBlock'){
   validateAcademicAttrs(n.type,n.attrs);
   if(parent!=='doc'||n.text!==undefined||n.marks!==undefined||!Array.isArray(n.content)||!n.content.length||n.content[0].type!=='paragraph')throw Error('Academic blocks require a top-level paragraph-first body.');
   const {id,kind,label}=n.attrs;
   if(ids.has(id)||labels.has(label)||++blocks>BLOCK_LIMIT)throw Error('Duplicate academic ID or label, or block limit exceeded.');
   ids.add(id);labels.add(label);targets.set(id,{id,kind,label,number:kind==='proof'?null:++number});
  }else if(n.type==='displayEquation'){
   const {id,numbered}=validateEquation(n.type,n.attrs);if(numbered)equationNumber++;
   if(id!=null){if(ids.has(id))throw Error('Duplicate academic or equation ID.');ids.add(id);if(numbered)targets.set(id,{id,kind:'equation',label:'eq-'+id,number:equationNumber});}
  }else if(n.type==='academicReference'){
   validateAcademicAttrs(n.type,n.attrs);
   if(!['paragraph','heading'].includes(parent)||n.text!==undefined||n.content!==undefined||n.marks!==undefined||++refs>REFERENCE_LIMIT)throw Error('Invalid academic reference placement or limit.');
  }
  for(const c of n.content??[])walk(c,n.type);
 }
 walk(root,null);return targets;
}
export function targetText(t){if(t?.kind==='equation')return 'Equation ('+t.number+')';return t?kindName(t.kind)+(t.number===null?' ['+t.label+']':' '+t.number):'[Unresolved reference]';}
export function academicText(node,targets){
 if(node.type==='academicReference')return targetText(targets.get(node.attrs.targetId))+' {ref:'+node.attrs.targetId+'}';
 if(node.type==='academicBlock')return targetText(targets.get(node.attrs.id))+' ['+node.attrs.label+']';
 return '';
}
