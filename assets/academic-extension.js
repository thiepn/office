import {Node,Extension} from '@tiptap/core';
import {Plugin,PluginKey,NodeSelection,TextSelection,Selection} from '@tiptap/pm/state';
import {Decoration,DecorationSet} from '@tiptap/pm/view';
import {ACADEMIC_KINDS,academicIndex,kindName,targetText,validateAcademicAttrs} from './academic-format.js';
const key=new PluginKey('officeAcademicIndex');
function indexDoc(doc){
 const targets=academicIndex(doc.toJSON()),positions=new Map(),decos=[];
 doc.descendants((n,pos)=>{if(n.type.name==='academicBlock')positions.set(n.attrs.id,pos);});
 doc.descendants((n,pos)=>{
  const target=n.type.name==='academicBlock'?targets.get(n.attrs.id):n.type.name==='academicReference'?targets.get(n.attrs.targetId):null;
  if(n.type.name==='academicBlock'||n.type.name==='academicReference'){
   const caption=targetText(target);
   decos.push(Decoration.node(pos,pos+n.nodeSize,{'data-academic-caption':caption},{caption,resolved:!!target,label:target?.label??''}));
  }
 });
 return {targets,positions,decos:DecorationSet.create(doc,decos)};
}
export const AcademicIndex=Extension.create({name:'academicIndex',addProseMirrorPlugins(){return [new Plugin({key,state:{init:(_,s)=>indexDoc(s.doc),apply:(tr,old)=>tr.docChanged?indexDoc(tr.doc):old},filterTransaction(tr){if(!tr.docChanged)return true;try{academicIndex(tr.doc.toJSON());return true;}catch{return false;}},props:{decorations:s=>key.getState(s).decos}})];}});
export const AcademicBlock=Node.create({
 name:'academicBlock',group:'block',content:'paragraph (paragraph | heading | blockquote | bulletList | orderedList | codeBlock | horizontalRule | table | displayEquation)*',defining:true,isolating:true,selectable:true,
 addAttributes(){return {id:{default:null},kind:{default:'theorem'},label:{default:null}};},
 renderHTML({node}){return ['section',{'data-office-academic-block':node.attrs.kind},['p',{},kindName(node.attrs.kind)+' ['+node.attrs.label+']'],['div',{},0]];},
 addNodeView(){return ({node,decorations,view,getPos})=>{
  const doc=view.dom.ownerDocument,dom=doc.createElement('section'),head=doc.createElement('div'),caption=doc.createElement('strong'),label=doc.createElement('span'),contentDOM=doc.createElement('div');
  dom.className='office-academic-block';head.className='office-academic-header';head.contentEditable='false';caption.className='office-academic-caption';label.className='office-academic-label';head.append(caption,label);contentDOM.className='office-academic-body';dom.append(head,contentDOM);
  function update(n,d){if(n.type.name!=='academicBlock')return false;dom.dataset.academicId=n.attrs.id;dom.dataset.academicKind=n.attrs.kind;caption.textContent=d[0]?.spec.caption??kindName(n.attrs.kind);label.textContent=n.attrs.label;return true;}
  update(node,decorations);
  const select=e=>{if(e.button!==0)return;const pos=getPos();if(typeof pos!=='number')return;e.preventDefault();view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc,pos)));view.focus();};
  head.addEventListener('mousedown',select);
  return {dom,contentDOM,update,stopEvent:e=>head.contains(e.target),ignoreMutation:m=>head.contains(m.target)||(m.target===dom&&m.type==='attributes'),selectNode(){dom.classList.add('ProseMirror-selectednode');},deselectNode(){dom.classList.remove('ProseMirror-selectednode');},destroy(){head.removeEventListener('mousedown',select);}};
 };}
});
export const AcademicReference=Node.create({
 name:'academicReference',group:'inline',inline:true,atom:true,selectable:true,marks:'',
 addAttributes(){return {targetId:{default:null}};},
 renderHTML({node}){return ['span',{'data-office-academic-reference':node.attrs.targetId},'[ref:'+node.attrs.targetId+']'];},
 renderText({node}){return '[ref:'+node.attrs.targetId+']';},
 addNodeView(){return ({node,decorations,view,getPos})=>{
  const dom=view.dom.ownerDocument.createElement('span');dom.className='office-academic-reference';dom.contentEditable='false';let targetId;
  function update(n,d){if(n.type.name!=='academicReference')return false;targetId=n.attrs.targetId;dom.textContent=d[0]?.spec.caption??'[Unresolved reference]';dom.dataset.unresolved=String(!d[0]?.spec.resolved);dom.title=d[0]?.spec.resolved?'Double-click to navigate: '+d[0].spec.label:'Missing target; select to repair reference';return true;}
  update(node,decorations);
  const select=e=>{if(e.button!==0)return;const p=getPos();if(typeof p!=='number')return;e.preventDefault();view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc,p)));view.focus();};
  const jump=e=>{e.preventDefault();const p=key.getState(view.state).positions.get(targetId);if(p===undefined)return;view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,p+2)).scrollIntoView());view.focus();view.nodeDOM(p)?.scrollIntoView?.({block:'nearest'});};
  dom.addEventListener('mousedown',select);dom.addEventListener('dblclick',jump);
  return {dom,update,stopEvent:e=>['mousedown','dblclick'].includes(e.type),ignoreMutation:()=>true,selectNode(){dom.classList.add('ProseMirror-selectednode');},deselectNode(){dom.classList.remove('ProseMirror-selectednode');},destroy(){dom.removeEventListener('mousedown',select);dom.removeEventListener('dblclick',jump);}};
 };}
});
export function currentAcademic(editor){
 const s=editor.state.selection;
 if(s instanceof NodeSelection&&s.node.type.name==='academicBlock')return {pos:s.from,node:s.node};
 for(let d=s.$from.depth;d>0;d--)if(s.$from.node(d).type.name==='academicBlock')return {pos:s.$from.before(d),node:s.$from.node(d)};
 return null;
}
export function currentReference(editor){const s=editor.state.selection;return s instanceof NodeSelection&&s.node.type.name==='academicReference'?{pos:s.from,node:s.node}:null;}
export function createAcademicDialog(doc,container,validateContent,onError){
 const dialog=doc.createElement('dialog');dialog.className='office-equation-dialog office-academic-dialog';dialog.setAttribute('aria-labelledby','academic-dialog-title');
 const el=(tag,text)=>{const x=doc.createElement(tag);if(text!==undefined)x.textContent=text;return x;};
 const form=el('form');form.method='dialog';const heading=el('h2','Academic structure');heading.id='academic-dialog-title';
 const kind=el('select');kind.setAttribute('aria-label','Academic block kind');for(const k of ACADEMIC_KINDS){const o=el('option',kindName(k));o.value=k;kind.append(o);}
 const label=el('input');label.setAttribute('aria-label','Academic label');label.maxLength=64;label.autocomplete='off';
 const kl=el('label','Block type');kl.append(kind);const ll=el('label','Stable label (unique within document)');ll.append(label);
 const target=el('select');target.setAttribute('aria-label','Reference target');const tl=el('label','Reference target');tl.append(target);
 const hint=el('p','Numbers update automatically. References follow the target ID even when its label changes.');
 const message=el('p');message.setAttribute('aria-live','polite');
 const apply=el('button','Apply academic structure');apply.type='submit';const cancel=el('button','Cancel academic structure');cancel.type='button';cancel.addEventListener('click',()=>dialog.close());
 form.append(heading,kl,ll,tl,hint,message,apply,cancel);dialog.append(form);container.append(dialog);
 let pending=null;
 function fillTargets(editor,existing){target.replaceChildren();const targets=key.getState(editor.state).targets;
  if(existing&&!targets.has(existing)){const o=el('option','Unresolved reference');o.value=existing;target.append(o);}
  for(const t of targets.values()){const o=el('option',targetText(t)+' — '+t.label);o.value=t.id;target.append(o);}
  if(existing)target.value=existing;
 }
 function validate(){if(!pending)return false;try{
  if(pending.mode==='reference'){if(!target.value)throw Error('Choose an academic target.');validateAcademicAttrs('academicReference',{targetId:target.value});}
  else{const attrs={id:pending.id,kind:kind.value,label:label.value};validateAcademicAttrs('academicBlock',attrs);for(const t of key.getState(pending.editor.state).targets.values())if(t.label===attrs.label&&t.id!==attrs.id)throw Error('This label is already used.');}
  message.textContent='';apply.disabled=false;return true;
 }catch(e){message.textContent=e.message;apply.disabled=true;return false;}}
 for(const input of [kind,label,target])input.addEventListener('input',validate);
 target.addEventListener('change',validate);kind.addEventListener('change',validate);
 form.addEventListener('submit',e=>{e.preventDefault();if(!pending||!validate())return;const {editor,mode,original,selection,editing,id}=pending;
  if(editor.isDestroyed||editor.state.doc!==original){message.textContent='Document changed. Cancel and reopen.';return;}
  try{
   const tr=editor.state.tr;
   if(mode==='block'){
    const attrs={id,kind:kind.value,label:label.value};
    if(editing)tr.setNodeMarkup(editing.pos,undefined,attrs);
    else{
     const block=editor.schema.node('academicBlock',attrs,[editor.schema.node('paragraph')]);
     // Add after the current root child, preserving all selected content and other blocks.
     const pos=selection.$to.depth?selection.$to.after(1):selection.to;
     tr.insert(pos,block);tr.setSelection(TextSelection.create(tr.doc,pos+2));
    }
   }else{
    const attrs={targetId:target.value};
    if(editing)tr.setNodeMarkup(editing.pos,undefined,attrs);
    else{
     const n=editor.schema.node('academicReference',attrs);
     if(selection instanceof NodeSelection){
      if(selection.node.isInline){tr.setSelection(TextSelection.create(tr.doc,selection.to));tr.replaceSelectionWith(n,false);}
      else{const pos=selection.to;const paragraph=editor.schema.node('paragraph',null,[n]);tr.insert(pos,paragraph);tr.setSelection(TextSelection.create(tr.doc,pos+1+n.nodeSize));}
     }else{if(!selection.$from.parent.inlineContent)throw Error('Place the cursor in a paragraph or heading.');tr.replaceSelectionWith(n,false);}
    }
   }
   tr.doc.check();validateContent(tr.doc.toJSON());editor.view.dispatch(tr.scrollIntoView());pending=null;dialog.close();editor.view.focus();
  }catch(e){message.textContent=e.message;onError(e.message);}
 });
 dialog.addEventListener('close',()=>{if(!dialog.open)pending=null;});
 return {open(editor,mode,editing=null){
  if(dialog.open)return;const id=editing?.node.attrs.id??crypto.randomUUID();
  pending={editor,mode,original:editor.state.doc,selection:editor.state.selection,editing,id};
  heading.textContent=mode==='reference'?(editing?'Edit cross-reference':'Insert cross-reference'):(editing?'Edit academic block':'Insert academic block');
  kl.hidden=ll.hidden=mode==='reference';tl.hidden=mode!=='reference';
  if(mode==='reference')fillTargets(editor,editing?.node.attrs.targetId);
  else{kind.value=editing?.node.attrs.kind??'theorem';label.value=editing?.node.attrs.label??('stmt-'+id);}
  dialog.showModal();validate();(mode==='reference'?target:label).focus();
 }};
}
