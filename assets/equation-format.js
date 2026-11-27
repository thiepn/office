// Dependency-free stored equation contract. Rendering is validated separately.
export const EQUATION_LIMIT=2048, EQUATION_COUNT_LIMIT=128;
export const EQUATION_TYPES=Object.freeze(['inlineEquation','displayEquation']);
export const isEquation=type=>EQUATION_TYPES.includes(type);
const unsafeCommand=/\\(?:href|url|includegraphics|html[A-Za-z]*|class|style|cssId|unicode|def|gdef|edef|xdef|let|futurelet|newcommand|renewcommand|providecommand|global|catcode|input|include|openout|write|read|usepackage|csname|expandafter|noexpand|tag|label|ref|eqref|notag|nonumber)(?![A-Za-z])/;
export function validateEquation(type,attrs){
 const display=type==='displayEquation';
 if(!isEquation(type)||!attrs||typeof attrs!=='object'||Array.isArray(attrs)||Object.keys(attrs).sort().join(',')!==(display?'latex,numbered':'latex')||
 typeof attrs.latex!=='string'||!attrs.latex.trim()||new TextEncoder().encode(attrs.latex).length>EQUATION_LIMIT||
 /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(attrs.latex)||unsafeCommand.test(attrs.latex)||
 (display&&typeof attrs.numbered!=='boolean')||(!display&&/[\r\n]/.test(attrs.latex)))throw Error('Invalid equation source or attributes.');
 return attrs;
}
export function equationInventory(content){
 const out=[];let number=0;
 function walk(n){if(isEquation(n.type)){validateEquation(n.type,n.attrs);out.push({type:n.type,latex:n.attrs.latex,number:n.type==='displayEquation'&&n.attrs.numbered?++number:null});}for(const c of n.content??[])walk(c);}
 walk(content);return out;
}
export function equationRecovery(node){return node.type==='inlineEquation'?'\\('+node.attrs.latex+'\\)':'\\[\n'+node.attrs.latex+'\n\\]';}
export function equationSourceExport(content){
 const equations=equationInventory(content),tick=String.fromCharCode(96),runs=new RegExp(tick+'+','g');
 return '# Equation source inventory\n\nOriginal LaTeX fragments, in document order. Numbers are derived, not stored. Review fragments before compiling with a TeX engine.\n\n'+equations.map((e,i)=>{
  const fence=tick.repeat(Math.max(3,1+Math.max(0,...(e.latex.match(runs)??[]).map(s=>s.length))));
  return '## '+(i+1)+'. '+(e.type==='inlineEquation'?'Inline equation':e.number===null?'Unnumbered display':'Equation ('+e.number+')')+'\n\n'+fence+'latex\n'+e.latex+'\n'+fence+'\n';
 }).join('\n');
}
