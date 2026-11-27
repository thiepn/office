// Document-local sources, immutable UUIDs, derived numeric citations.
export const SOURCE_TYPES=['article','book','inproceedings','incollection','thesis','phdthesis','mastersthesis','techreport','online','misc','unpublished','manual'];
export const SOURCE_FIELDS=['author','editor','title','year','journal','booktitle','publisher','institution','school','volume','number','pages','edition','address','month','doi','url','note','howpublished','organization','series','isbn','issn','chapter','type'];
export const SOURCE_LIMIT=128,CITATION_LIMIT=1024;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const bibKey=/^[A-Za-z0-9][A-Za-z0-9_.:+/-]{0,79}$/;
function exact(o,keys){return !!o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===keys;}
function balanced(s){let depth=0;for(let i=0;i<s.length;i++){if(s[i]==='\\'){i++;continue;}if(s[i]==='{')depth++;if(s[i]==='}'&&--depth<0)return false;}return depth===0;}
export function validateSource(s){
 if(!exact(s,'fields,id,key,type')||typeof s.id!=='string'||!uuid.test(s.id)||typeof s.key!=='string'||!bibKey.test(s.key)||!SOURCE_TYPES.includes(s.type)||!s.fields||typeof s.fields!=='object'||Array.isArray(s.fields))throw Error('Invalid source identity or type.');
 if(typeof s.fields.title!=='string'||!s.fields.title.trim())throw Error('Source title is required.');
 for(const [k,v] of Object.entries(s.fields)){
  if(!SOURCE_FIELDS.includes(k)||typeof v!=='string'||!v.trim()||new TextEncoder().encode(v).length>2048||/[\u0000-\u001f\u007f]/u.test(v)||!balanced(v)||/\\$/.test(v))throw Error('Invalid source field: '+k);
 }
 return s;
}
export function validateResearchAttrs(type,a){
 if(type==='researchCatalog'){
  if(!exact(a,'sources')||!Array.isArray(a.sources)||a.sources.length>SOURCE_LIMIT)throw Error('Invalid source catalogue.');
  const ids=new Set(),keys=new Set();let bytes=0;
  for(const s of a.sources){validateSource(s);if(ids.has(s.id)||keys.has(s.key))throw Error('Duplicate source ID or BibTeX key.');ids.add(s.id);keys.add(s.key);bytes+=new TextEncoder().encode(JSON.stringify(s)).length;}
  if(bytes>180000)throw Error('Source catalogue exceeds storage limit.');
 }else if(type==='researchCitation'){
  if(!exact(a,'sourceId')||typeof a.sourceId!=='string'||!uuid.test(a.sourceId))throw Error('Invalid citation identity.');
 }else throw Error('Unknown research node.');
 return a;
}
export function researchIndex(root){
 let catalog=null;const cited=[],numbers=new Map();let count=0;
 function walk(n,parent){
  if(n.type==='researchCatalog'){
   validateResearchAttrs(n.type,n.attrs);if(catalog||parent!=='doc'||n.content!==undefined||n.text!==undefined||n.marks!==undefined)throw Error('Only one top-level source catalogue is permitted.');
   catalog=n.attrs.sources;
  }else if(n.type==='researchCitation'){
   validateResearchAttrs(n.type,n.attrs);if(!['paragraph','heading'].includes(parent)||n.content!==undefined||n.text!==undefined||n.marks!==undefined||++count>CITATION_LIMIT)throw Error('Invalid citation placement or limit.');
   if(!numbers.has(n.attrs.sourceId)){cited.push(n.attrs.sourceId);numbers.set(n.attrs.sourceId,cited.length);}
  }
  for(const c of n.content??[])walk(c,n.type);
 }
 walk(root,null);const sources=new Map((catalog??[]).map(s=>[s.id,s]));
 // Missing sources retain their IDs, but do not receive a misleading visible number.
 const ordered=cited.filter(id=>sources.has(id));numbers.clear();ordered.forEach((id,i)=>numbers.set(id,i+1));
 return {catalog,sources,numbers,ordered};
}
export const citationText=(idx,id)=>idx.numbers.has(id)?'['+idx.numbers.get(id)+']':'[Missing citation]';
export function sourceText(s){const f=s.fields;return [f.author||f.editor,f.title,f.journal||f.booktitle,f.publisher||f.institution||f.school,f.year,f.volume&&'vol. '+f.volume,f.number&&'no. '+f.number,f.pages&&'pp. '+f.pages,f.doi&&'DOI: '+f.doi,f.url].filter(Boolean).join('. ');}
export function bibliographyText(idx){return idx.ordered.map(id=>citationText(idx,id)+' '+sourceText(idx.sources.get(id))).join('\n');}
// Strict, bounded BibTeX subset. No macros, concatenation, directives or silent field loss.
export function parseBibTeX(text,makeId=()=>crypto.randomUUID()){
 if(typeof text!=='string'||text.length>180000)throw Error('BibTeX input exceeds limit.');
 let i=0;const out=[];
 const ws=()=>{while(i<text.length&&/\s/.test(text[i]))i++;};
 const take=c=>{ws();if(text[i++]!==c)throw Error('Expected '+c+' near character '+i);};
 const word=()=>{ws();const m=/^[A-Za-z][A-Za-z0-9_-]*/.exec(text.slice(i));if(!m)throw Error('Expected identifier near '+i);i+=m[0].length;return m[0].toLowerCase();};
 function value(){ws();const start=text[i];if(start!=='{'&&start!=='"'){const m=/^\d+/.exec(text.slice(i));if(!m)throw Error('Only literal BibTeX values are supported.');i+=m[0].length;return m[0];}
  i++;let depth=0,v='';while(i<text.length){const c=text[i++];if(c==='\\'){if(i>=text.length)throw Error('Incomplete escape.');v+=c+text[i++];continue;}
   if(c==='{' ){depth++;v+=c;continue;}
   if(c==='}'){if(start==='{'&&depth===0)return v;if(depth===0)throw Error('Unbalanced field.');depth--;v+=c;continue;}
   if(c==='"'&&start==='"'&&depth===0)return v;v+=c;
  }throw Error('Unclosed BibTeX field.');
 }
 ws();while(i<text.length){take('@');const type=word();if(!SOURCE_TYPES.includes(type))throw Error('Unsupported BibTeX entry type or directive: '+type);take('{');ws();const m=/^[A-Za-z0-9][A-Za-z0-9_.:+/-]{0,79}/.exec(text.slice(i));if(!m)throw Error('Invalid BibTeX key.');i+=m[0].length;take(',');const fields={};
  while(true){ws();if(text[i]==='}'){i++;break;}const field=word();if(!SOURCE_FIELDS.includes(field)||Object.hasOwn(fields,field))throw Error('Unsupported or repeated BibTeX field: '+field);take('=');fields[field]=value();ws();if(text[i]==='}') {i++;break;}take(',');}
  out.push(validateSource({id:makeId(),key:m[0],type,fields}));if(out.length>SOURCE_LIMIT)throw Error('Too many entries.');ws();
 }
 if(!out.length)throw Error('No BibTeX entries.');validateResearchAttrs('researchCatalog',{sources:out});return out;
}
export function exportBibTeX(sources){validateResearchAttrs('researchCatalog',{sources});return sources.map(s=>'@'+s.type+'{'+s.key+',\n'+SOURCE_FIELDS.filter(k=>Object.hasOwn(s.fields,k)).map(k=>'  '+k+' = {'+s.fields[k]+'}').join(',\n')+'\n}').join('\n\n')+(sources.length?'\n':'');}
