import {exportPublication,PUBLICATION_TEMPLATES} from './publication-format.js';
export function createPublicationDialog(doc,panel,getSnapshot,getTitle){
 const el=(tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const d=el('dialog');d.className='office-equation-dialog office-research-dialog';d.setAttribute('aria-label','Academic publication');
 const select=el('select');select.setAttribute('aria-label','Publication template');
 for(const [value,t] of Object.entries(PUBLICATION_TEMPLATES)){const o=el('option',t.label);o.value=value;select.append(o);}
 const author=el('input');author.maxLength=200;author.setAttribute('aria-label','Publication author');
 const abstract=el('textarea');abstract.maxLength=4000;abstract.setAttribute('aria-label','Publication abstract');
 const status=el('p');status.setAttribute('aria-live','polite');
 const label=(text,input)=>{const l=el('label',text);l.append(input);return l;};
 const button=(text,fn)=>{const b=el('button',text);b.type='button';b.addEventListener('click',fn);return b;};
 const download=button('Download LaTeX',()=>{
  try{
   const title=getTitle()||'Untitled',result=exportPublication(getSnapshot(),{title,author:author.value,abstract:abstract.value,template:select.value});
   const url=URL.createObjectURL(new Blob([result.tex],{type:'text/plain;charset=utf-8'}));
   const a=el('a');a.href=url;a.download=(title.replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,80)||'office-publication')+'.tex';d.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
   status.textContent=result.warnings.length?'Exported with warnings: '+result.warnings.join(' · '):'Standalone LaTeX exported.';
  }catch(e){status.textContent=e.message;}
 });
 d.append(el('h2','Academic publication'),label('Template',select),label('Author',author),label('Abstract (optional)',abstract),el('p','Download a complete .tex document. Compile locally twice with XeLaTeX (no shell escape). For immediate browser PDF use Print / Save PDF in the editor.'),download,status,button('Close publication',()=>d.close()));panel.append(d);
 return {open(){try{getSnapshot();status.textContent='';d.showModal();select.focus();}catch(e){status.textContent=e.message;}}};
}
