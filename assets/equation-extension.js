import {Node} from '@tiptap/core';
import {Plugin,PluginKey,NodeSelection} from '@tiptap/pm/state';
import {Decoration,DecorationSet} from '@tiptap/pm/view';
import katex from 'katex';
import {validateEquation,isEquation,EQUATION_LIMIT} from './equation-format.js';

const key=new PluginKey('officeEquationNumbering');
function numbers(doc){
 let n=0;const decorations=[];
 doc.descendants((node,pos)=>{if(node.type.name==='displayEquation'&&node.attrs.numbered){const number=++n;decorations.push(Decoration.node(pos,pos+node.nodeSize,{'data-equation-number':String(number)},{number}));}});
 return DecorationSet.create(doc,decorations);
}
function options(display){return {displayMode:display,output:'mathml',throwOnError:true,strict:'error',trust:false,maxExpand:200,maxSize:20,macros:Object.create(null),globalGroup:false};}
export function renderEquation(type,attrs,host){
 validateEquation(type,attrs);
 host.replaceChildren();
 // Only library-generated DOM, never user HTML. No remote resources.
 katex.render(attrs.latex,host,options(type==='displayEquation'));
 if(!host.querySelector('math'))throw Error('MathML output unavailable.');
}
function equationNode(display){
 const name=display?'displayEquation':'inlineEquation';
 return Node.create({
  name,group:display?'block':'inline',inline:!display,atom:true,selectable:true,draggable:false,marks:'',
  addAttributes(){return {latex:{default:''},...(display?{numbered:{default:true}}:{})};},
  renderHTML({node}){return [display?'div':'span',{'data-office-equation':name},node.attrs.latex];},
  renderText({node}){return node.attrs.latex;},
  addNodeView(){return ({node,decorations,editor,getPos})=>{
   const doc=editor.view.dom.ownerDocument,dom=doc.createElement(display?'div':'span');
   dom.className='office-equation '+(display?'office-equation-display':'office-equation-inline');dom.dataset.officeEquation=name;dom.contentEditable='false';
   const math=doc.createElement('span');math.className='office-equation-math';
   const number=doc.createElement('span');number.className='office-equation-number';dom.append(math,number);
   let previous=null;
   function update(next,decos){
    if(next.type.name!==name)return false;
    if(next.attrs.latex!==previous){
     try{renderEquation(name,next.attrs,math);dom.removeAttribute('data-equation-error');}
     catch{math.textContent=next.attrs.latex;dom.dataset.equationError='true';}
     previous=next.attrs.latex;
    }
    const n=display&&next.attrs.numbered?decos.find(d=>Number.isInteger(d.spec.number))?.spec.number:null;
    number.textContent=n?'('+n+')':'';number.hidden=!n;
    dom.title=dom.dataset.equationError?'Equation could not render; LaTeX source retained. Select and edit.':'Select to edit LaTeX';
    return true;
   }
   update(node,decorations);
   const select=event=>{if(event.button!==0)return;const pos=getPos();if(typeof pos!=='number')return;event.preventDefault();editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc,pos)));editor.view.focus();};
   dom.addEventListener('mousedown',select);
   return {dom,update,selectNode(){dom.classList.add('ProseMirror-selectednode');},deselectNode(){dom.classList.remove('ProseMirror-selectednode');},stopEvent:event=>event.type==='mousedown',ignoreMutation:()=>true,destroy(){dom.removeEventListener('mousedown',select);}};
  };},
  addProseMirrorPlugins(){return display?[new Plugin({key,state:{init:(_,state)=>numbers(state.doc),apply:(tr,old)=>tr.docChanged?numbers(tr.doc):old},props:{decorations:state=>key.getState(state)}})]:[];}
 });
}
export const InlineEquation=equationNode(false),DisplayEquation=equationNode(true);
export function selectedEquation(editor){const s=editor.state.selection;return s instanceof NodeSelection&&isEquation(s.node.type.name)?{pos:s.from,node:s.node}:null;}
export function createEquationDialog(doc,container,onError){
 const dialog=doc.createElement('dialog');dialog.className='office-equation-dialog';dialog.setAttribute('aria-labelledby','office-equation-heading');
 const form=doc.createElement('form');form.method='dialog';
 function el(tag,text){const x=doc.createElement(tag);if(text!==undefined)x.textContent=text;return x;}
 const heading=el('h2','Edit equation');heading.id='office-equation-heading';
 const source=el('textarea');source.setAttribute('aria-label','Equation LaTeX');source.rows=5;source.maxLength=EQUATION_LIMIT;source.spellcheck=false;
 const label=el('label','LaTeX source (without outer delimiters)');label.append(source);
 const numbered=el('input');numbered.type='checkbox';const numberLabel=el('label','Automatic equation number');numberLabel.prepend(numbered);
 const preview=el('div');preview.className='office-equation-preview';preview.setAttribute('aria-label','Equation preview');
 const message=el('p');message.setAttribute('aria-live','polite');
 const hint=el('p','Examples: \\frac{a}{b}, \\sqrt{x}, \\sum_{i=1}^n i, \\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}');
 const save=el('button','Apply equation');save.type='submit';const cancel=el('button','Cancel equation');cancel.type='button';cancel.addEventListener('click',()=>dialog.close());
 form.append(heading,label,numberLabel,hint,preview,message,save,cancel);dialog.append(form);container.append(dialog);
 let pending=null;
 function attrs(){return {latex:source.value,...(pending.type==='displayEquation'?{numbered:numbered.checked}:{})};}
 function refresh(){if(!pending)return false;try{renderEquation(pending.type,attrs(),preview);message.textContent='';save.disabled=false;return true;}catch{preview.replaceChildren();message.textContent='Invalid or unsupported LaTeX. Correct the source before applying.';save.disabled=true;return false;}}
 source.addEventListener('input',refresh);numbered.addEventListener('change',refresh);
 form.addEventListener('submit',event=>{
  event.preventDefault();if(!pending||!refresh())return;
  const {editor,type,original,selection,editing}=pending;
  if(editor.isDestroyed||editor.state.doc!==original){message.textContent='Document changed. Cancel and reopen the equation editor.';return;}
  try{
   const node={type,attrs:attrs()};
   // Validate candidate transaction before dispatch; prevent an invalid edit becoming unsavable.
   const tr=editor.state.tr;
   if(editing)tr.setNodeMarkup(editing.pos,undefined,node.attrs);
   else{tr.setSelection(selection.map(tr.doc,tr.mapping));tr.replaceSelectionWith(editor.schema.node(type,node.attrs),false);}
   tr.doc.check();
   const content=tr.doc.toJSON();
   let count=0;tr.doc.descendants(n=>{if(isEquation(n.type.name))count++;});
   if(count>128)throw Error('Maximum 128 equations per document.');
   // Source size and full structured snapshot checks also run in the regular save path.
   editor.view.dispatch(tr.scrollIntoView());dialog.close();editor.view.focus();
  }catch(e){message.textContent=e.message;onError(e.message);}
 });
 dialog.addEventListener('close',()=>{pending=null;});
 return {open(editor,type,editing=null){
  if(dialog.open)return;
  pending={editor,type,original:editor.state.doc,selection:editor.state.selection,editing};
  heading.textContent=editing?'Edit equation':type==='displayEquation'?'Insert display equation':'Insert inline equation';
  source.value=editing?.node.attrs.latex??'';numberLabel.hidden=type!=='displayEquation';numbered.checked=editing?.node.attrs.numbered??true;
  dialog.showModal();refresh();source.focus();
 }};
}
