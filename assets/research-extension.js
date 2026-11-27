import {Node,Extension} from '@tiptap/core';
import {Plugin,PluginKey,NodeSelection,TextSelection} from '@tiptap/pm/state';
import {Decoration,DecorationSet} from '@tiptap/pm/view';
import {researchIndex,validateSource,validateResearchAttrs,SOURCE_TYPES,SOURCE_FIELDS,citationText,sourceText,parseBibTeX,exportBibTeX} from './research-format.js';

const key=new PluginKey('officeResearchIndex');
function indexDoc(doc){
 const idx=researchIndex(doc.toJSON()),decos=[];let catalogPos=null;
 doc.descendants((n,pos)=>{
  if(n.type.name==='researchCatalog'){
   catalogPos=pos;
   const entries=idx.ordered.map(id=>({number:idx.numbers.get(id),text:sourceText(idx.sources.get(id))}));
   decos.push(Decoration.node(pos,pos+n.nodeSize,{'data-cited-order':idx.ordered.join(',')}, {entries,count:idx.sources.size}));
  }else if(n.type.name==='researchCitation'){
   const id=n.attrs.sourceId;decos.push(Decoration.node(pos,pos+n.nodeSize,{'data-citation-caption':citationText(idx,id),'data-citation-title':idx.sources.get(id)?.fields.title??''}, {caption:citationText(idx,id),resolved:idx.sources.has(id),title:idx.sources.get(id)?.fields.title??'Missing citation source'}));
  }
 });
 return {...idx,catalogPos,decos:DecorationSet.create(doc,decos)};
}
export const ResearchIndex=Extension.create({name:'officeResearchIndex',addProseMirrorPlugins(){return [new Plugin({key,state:{init:(_,s)=>indexDoc(s.doc),apply:(tr,old)=>tr.docChanged?indexDoc(tr.doc):old},filterTransaction(tr){if(!tr.docChanged)return true;try{researchIndex(tr.doc.toJSON());return true;}catch{return false;}},props:{decorations:s=>key.getState(s).decos}})];}});
export const ResearchCatalog=Node.create({
 name:'researchCatalog',group:'block',atom:true,selectable:true,draggable:false,
 addAttributes(){return {sources:{default:[]}};},
 renderHTML(){return ['section',{'data-office-bibliography':''},'Bibliography (structured sources)'];},
 addNodeView(){return ({node,decorations,view,getPos})=>{
  const doc=view.dom.ownerDocument,dom=doc.createElement('section'),heading=doc.createElement('h2'),list=doc.createElement('ol'),empty=doc.createElement('p'),info=doc.createElement('p');
  dom.className='office-bibliography';dom.contentEditable='false';heading.textContent='Bibliography';empty.className='office-bibliography-empty';info.className='office-bibliography-info';dom.append(heading,list,empty,info);
  function update(n,d){if(n.type.name!=='researchCatalog')return false;const entries=d[0]?.spec.entries??[];list.replaceChildren();
   for(const entry of entries){const li=doc.createElement('li');li.dataset.citationNumber=entry.number;li.textContent=entry.text;list.append(li);}
   empty.textContent=entries.length?'':'No cited sources yet.';empty.hidden=entries.length>0;
   info.textContent=n.attrs.sources.length+' saved source(s) · '+entries.length+' cited. Use Research sources to manage the catalogue.';return true;
  }
  update(node,decorations);
  return {dom,update,ignoreMutation:()=>true,selectNode(){dom.classList.add('ProseMirror-selectednode');},deselectNode(){dom.classList.remove('ProseMirror-selectednode');}};
 };}
});
export const ResearchCitation=Node.create({
 name:'researchCitation',inline:true,group:'inline',atom:true,selectable:true,marks:'',
 addAttributes(){return {sourceId:{default:null}};},
 renderHTML({node}){return ['span',{'data-office-citation':node.attrs.sourceId},'[cite:'+node.attrs.sourceId+']'];},
 renderText({node}){return '[cite:'+node.attrs.sourceId+']';},
 addNodeView(){return ({node,decorations,view,getPos})=>{
  const dom=view.dom.ownerDocument.createElement('span');dom.className='office-citation';dom.contentEditable='false';
  function update(n,d){if(n.type.name!=='researchCitation')return false;dom.dataset.sourceId=n.attrs.sourceId;dom.textContent=d[0]?.spec.caption??'[Missing citation]';dom.title=d[0]?.spec.title??'Missing citation source';dom.dataset.unresolved=String(!d[0]?.spec.resolved);return true;}
  update(node,decorations);
  const select=e=>{if(e.button!==0)return;const p=getPos();if(typeof p!=='number')return;e.preventDefault();view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc,p)));view.focus();};
  dom.addEventListener('mousedown',select);
  return {dom,update,stopEvent:e=>e.type==='mousedown',ignoreMutation:()=>true,selectNode(){dom.classList.add('ProseMirror-selectednode');},deselectNode(){dom.classList.remove('ProseMirror-selectednode');},destroy(){dom.removeEventListener('mousedown',select);}};
 };}
});
export function selectedCitation(editor){const s=editor.state.selection;return s instanceof NodeSelection&&s.node.type.name==='researchCitation'?{pos:s.from,node:s.node}:null;}
export function researchSources(editor){return key.getState(editor.state).catalog??[];}
function commitCatalogue(editor,sources,validateContent){
 validateResearchAttrs('researchCatalog',{sources});
 const idx=key.getState(editor.state),tr=editor.state.tr;
 if(idx.catalogPos===null)tr.insert(tr.doc.content.size,editor.schema.node('researchCatalog',{sources}));
 else tr.setNodeMarkup(idx.catalogPos,undefined,{sources});
 tr.doc.check();validateContent(tr.doc.toJSON());editor.view.dispatch(tr);
}
export function createResearchDialog(doc,container,validateContent,onError,onBibExport){
 const el=(tag,text)=>{const x=doc.createElement(tag);if(text!==undefined)x.textContent=text;return x;};
 const dialog=el('dialog');dialog.className='office-equation-dialog office-research-dialog';dialog.setAttribute('aria-labelledby','research-heading');container.append(dialog);
 const title=el('h2','Research sources');title.id='research-heading';const list=el('select');list.setAttribute('aria-label','Research source');list.size=5;
 const actions=el('div');actions.className='office-research-actions';
 const message=el('p');message.setAttribute('aria-live','polite');
 const editorForm=el('form');editorForm.method='dialog';
 const type=el('select');type.setAttribute('aria-label','Source type');for(const k of SOURCE_TYPES){const option=el('option',k);option.value=k;type.append(option);}
 const citeKey=el('input');citeKey.setAttribute('aria-label','BibTeX key');citeKey.maxLength=80;
 const fieldWrap=el('div');fieldWrap.className='office-research-fields';const fields={};
 function labeled(name,input){const l=el('label',name);l.append(input);return l;}
 editorForm.append(labeled('Entry type',type),labeled('BibTeX key',citeKey));
 for(const f of SOURCE_FIELDS){const input=el('input');input.setAttribute('aria-label','Source '+f);input.maxLength=2048;fields[f]=input;fieldWrap.append(labeled(f,input));}
 editorForm.append(fieldWrap);
 const save=el('button','Save source');save.type='submit';editorForm.append(save);
 const bib=el('textarea');bib.setAttribute('aria-label','BibTeX input');bib.rows=7;bib.maxLength=180000;
 const imports=el('details');imports.append(el('summary','Import BibTeX'),el('p','Paste literal BibTeX entries. Duplicate keys and unsupported fields reject the entire import.'),bib);
 const file=el('input');file.type='file';file.accept='.bib,text/plain,application/x-bibtex';file.setAttribute('aria-label','BibTeX file');imports.append(file);
 let pending=null,editingId=null;
 function action(parent,name,fn){const b=el('button',name);b.type='button';b.addEventListener('click',()=>{try{fn();}catch(e){message.textContent=e.message;onError(e.message);}});parent.append(b);return b;}
 function check(){if(!pending||pending.editor.isDestroyed||pending.editor.state.doc!==pending.original)throw Error('Document changed. Close and reopen research sources.');return pending.editor;}
 function refresh(preferred){const editor=check();list.replaceChildren();for(const s of researchSources(editor)){const o=el('option',s.key+' — '+s.fields.title);o.value=s.id;list.append(o);}if(preferred)list.value=preferred;remove.disabled=!list.value;edit.disabled=!list.value;}
 function load(s){editingId=s?.id??crypto.randomUUID();type.value=s?.type??'article';citeKey.value=s?.key??'';for(const f of SOURCE_FIELDS)fields[f].value=s?.fields[f]??'';editorForm.hidden=false;citeKey.focus();}
 function changed(sources,preferred){const editor=check();commitCatalogue(editor,sources,validateContent);pending.original=editor.state.doc;refresh(preferred);editorForm.hidden=true;message.textContent='Source catalogue saved.';}
 const add=action(actions,'New source',()=>{check();load(null);});
 const edit=action(actions,'Edit source',()=>{const s=researchSources(check()).find(x=>x.id===list.value);if(s)load(s);});
 const remove=action(actions,'Remove source',()=>{const editor=check(),id=list.value;if(!id)return;if(!window.confirm('Remove this source? Existing citations will become unresolved.'))return;changed(researchSources(editor).filter(s=>s.id!==id));});
 action(actions,'Export BibTeX',()=>{const sources=researchSources(check());if(!sources.length)throw Error('No sources to export.');onBibExport(exportBibTeX(sources));});
 action(imports,'Import entries',()=>{const editor=check(),incoming=parseBibTeX(bib.value),all=[...researchSources(editor),...incoming];changed(all,incoming[0].id);bib.value='';});
 file.addEventListener('change',async()=>{const selected=file.files?.[0];file.value='';if(!selected)return;try{check();if(selected.size>180000)throw Error('BibTeX file exceeds limit.');const old=pending;const text=await selected.text();if(pending!==old)return;check();bib.value=text;imports.open=true;message.textContent='File loaded. Review and import entries.';}catch(e){message.textContent=e.message;}});
 editorForm.addEventListener('submit',e=>{e.preventDefault();try{const editor=check(),data={};for(const f of SOURCE_FIELDS){const v=fields[f].value;if(v.trim())data[f]=v;}const s=validateSource({id:editingId,key:citeKey.value,type:type.value,fields:data});const sources=researchSources(editor),exists=sources.some(x=>x.id===s.id);changed(exists?sources.map(x=>x.id===s.id?s:x):[...sources,s],s.id);}catch(e){message.textContent=e.message;onError(e.message);}});
 list.addEventListener('change',()=>{remove.disabled=edit.disabled=!list.value;editorForm.hidden=true;});
 const citeActions=el('div'),insert=action(citeActions,'Apply citation',()=>{
  const editor=check();if(!list.value)throw Error('Choose a source.');const attrs={sourceId:list.value},tr=editor.state.tr,{selection,editing}=pending;
  if(editing)tr.setNodeMarkup(editing.pos,undefined,attrs);
  else{const node=editor.schema.node('researchCitation',attrs);
   if(selection instanceof NodeSelection){if(selection.node.isInline){tr.setSelection(TextSelection.create(tr.doc,selection.to));tr.replaceSelectionWith(node,false);}
    else{if(selection.node.type.name==='researchCatalog')throw Error('Place the cursor in the document body.');const pos=selection.to;tr.insert(pos,editor.schema.node('paragraph',null,[node]));tr.setSelection(TextSelection.create(tr.doc,pos+1+node.nodeSize));}}
   else{if(!selection.$from.parent.inlineContent)throw Error('Place the cursor in a paragraph or heading.');tr.replaceSelectionWith(node,false);}
  }
  tr.doc.check();validateContent(tr.doc.toJSON());editor.view.dispatch(tr.scrollIntoView());pending=null;dialog.close();editor.view.focus();
 });
 const close=action(dialog,'Close research dialog',()=>dialog.close());
 dialog.prepend(title,list,actions,editorForm,imports,citeActions,message);
 dialog.addEventListener('close',()=>{if(!dialog.open){pending=null;editingId=null;editorForm.hidden=true;}});
 return {open(editor,mode,editing=null){if(dialog.open)return;pending={editor,mode,editing,selection:editor.state.selection,original:editor.state.doc};title.textContent=mode==='manage'?'Research sources':editing?'Edit citation':'Insert citation';actions.hidden=imports.hidden=mode!=='manage';citeActions.hidden=mode==='manage';editorForm.hidden=true;message.textContent='';refresh(editing?.node.attrs.sourceId);if(editing&&!researchSources(editor).some(s=>s.id===editing.node.attrs.sourceId))message.textContent='Missing source. Choose a replacement.';dialog.showModal();list.focus();}};
}
