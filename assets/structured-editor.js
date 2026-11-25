import {Editor} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {TableKit} from '@tiptap/extension-table';
import {sourceToJSON,jsonToSource} from './visual.js';
import {safeLink,validateRich} from './rich-format.js';

export function mountVisual({paper,body,label,onChange,onRecovery,onRichExport,initialRich}){
 const doc=paper.ownerDocument;
 const el=(tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const button=(text,fn)=>{const b=el('button',text);b.type='button';b.addEventListener('click',fn);return b;};
 const controls=el('div');controls.className='visual-mode';controls.setAttribute('role','group');controls.setAttribute('aria-label','Editing mode');
 const source=button('Markdown source',()=>leave()),visual=button('Visual editor (beta)',()=>enter()),convert=button('Upgrade to structured document',()=>upgrade());
 controls.append(source,visual,convert);
 const note=el('p','Markdown remains the original document format. Visual compatibility mode does not convert records.');note.className='visual-note';note.setAttribute('aria-live','polite');
 const panel=el('section');panel.className='visual-panel';panel.hidden=true;panel.setAttribute('aria-label','Visual authoring');
 const tools=el('div');tools.className='visual-toolbar';tools.setAttribute('role','group');tools.setAttribute('aria-label','Visual formatting');
 const frame=el('div');frame.className='visual-page-frame';const host=el('div');frame.append(host);
 const recovery=button('Export visual recovery text',()=>onRecovery(editor?.getText({blockSeparator:'\n\n'})??''));recovery.hidden=true;
 const structuredExport=button('Export structured JSON',()=>{if(rich)onRichExport(rich);});structuredExport.hidden=true;
 panel.append(tools,frame,recovery);paper.prepend(controls,note,structuredExport);paper.append(panel);
 let active=false,blocked=false,editor=null,rich=initialRich??null,composing=false,selectionControls=[];
 function mode(v){active=v;body.hidden=v;label.hidden=v;body.readOnly=!!rich;panel.hidden=!v;source.setAttribute('aria-pressed',String(!v));visual.setAttribute('aria-pressed',String(v));convert.hidden=!!rich;structuredExport.hidden=!rich;}
 function error(v,message){blocked=v;recovery.hidden=!v;note.textContent=message;editor?.view.dom.setAttribute('aria-invalid',String(v));}
 function refresh(){
  for(const item of selectionControls){item.b.hidden=item.richOnly&&!rich;item.b.disabled=!editor||!active||composing||!!item.can&&!item.can(editor);if(item.pressed)item.b.setAttribute('aria-pressed',String(!!editor&&item.pressed(editor)));}
 }
 function sync(){
  if(!active||!editor||composing)return;
  try{
   const content=editor.getJSON();editor.state.doc.check();
   if(rich){const next={version:1,originalMarkdown:rich.originalMarkdown,content};validateRich(next);rich=next;error(false,'Structured document · original Markdown is preserved.');onChange();}
   else{const next=jsonToSource(doc,content);error(false,'Visual mode · basic formatting is saved as Markdown.');if(body.value!==next){body.value=next;body.dispatchEvent(new Event('input',{bubbles:true}));}else onChange();}
  }catch(e){error(true,'Unsupported formatting. Unsaved visual edits are retained here. Export recovery text or correct the formatting.');onChange();}
  refresh();
 }
 function setup(content){
  editor?.destroy();editor=null;
  editor=new Editor({element:host,extensions:[
   StarterKit.configure({heading:{levels:[1,2,3]},trailingNode:false,link:{openOnClick:false,autolink:false,linkOnPaste:false,HTMLAttributes:{target:'_blank',rel:'noopener noreferrer'},isAllowedUri:(url,ctx)=>safeLink(url)&&ctx.defaultValidate(url)}}),
   TableKit.configure({table:{resizable:false}}),
  ],content,enableContentCheck:true,editorProps:{
   attributes:{class:'visual-page',role:'textbox','aria-label':'Visual document','aria-multiline':'true',spellcheck:'true'},
   handlePaste(view,event){event.preventDefault();const text=event.clipboardData?.getData('text/plain')??'';if(text)view.dispatch(view.state.tr.insertText(text));return true;},
   handleDrop(){return true;},
   handleDOMEvents:{compositionstart(){composing=true;onChange();return false;},compositionend(){composing=false;queueMicrotask(sync);return false;}}
  },onUpdate:sync,onSelectionUpdate:refresh,onTransaction:refresh});
  editor.state.doc.check();
  if(rich)validateRich({...rich,content:editor.getJSON()});
 }
 function enter(){
  if(active)return;
  try{
   const content=rich?validateRich(rich).content:sourceToJSON(doc,body.value);
   setup(content);
   if(!rich&&jsonToSource(doc,editor.getJSON())!==body.value)throw new Error('Round trip mismatch');
   mode(true);error(false,rich?'Structured document · original Markdown is preserved.':'Visual mode · basic formatting is saved as Markdown.');refresh();editor.commands.focus('start');
  }catch(e){editor?.destroy();editor=null;mode(false);error(!!rich,rich?'Structured record cannot be opened safely. Original source is read-only; export structured JSON for recovery.':'This formatting is not supported in visual mode. Original Markdown remains unchanged.');if(!rich)body.focus();}
 }
 function leave(){
  if(!active)return;
  if(blocked&&!window.confirm('Discard only the unsupported visual edits and return to the last valid draft?'))return;
  editor?.destroy();editor=null;error(false,rich?'Original Markdown (read-only). Return to visual editor to edit the structured document.':'Markdown source · no formatting conversion is applied.');mode(false);onChange();body.focus();
 }
 function upgrade(){
  if(rich||blocked||composing)return;
  if(!active)enter();
  if(!active||blocked)return;
  if(!window.confirm('Upgrade this document to structured editing? The current Markdown remains permanently available as original source; future edits are stored as structured JSON. This is an explicit one-way format upgrade.'))return;
  try{const next={version:1,originalMarkdown:body.value,content:editor.getJSON()};validateRich(next);rich=next;mode(true);sync();}catch(e){note.textContent=e.message;}
 }
 function tool(text,fn,{pressed,can,richOnly=false}={}){
  const b=button(text,()=>{if(!active||!editor||composing)return;try{if(fn(editor)!==false)sync();}catch(e){note.textContent=e.message;}});b.addEventListener('mousedown',e=>e.preventDefault());tools.append(b);selectionControls.push({b,pressed,can,richOnly});
 }
 // Selection and undo history are ProseMirror transactions, not DOM commands.
 tool('Normal',e=>e.chain().focus().setParagraph().run(),{pressed:e=>e.isActive('paragraph')});
 for(let level=1;level<=3;level++)tool('Heading '+level,e=>e.chain().focus().toggleHeading({level}).run(),{pressed:e=>e.isActive('heading',{level})});
 for(const [name,cmd,mark,only] of [['Bold','toggleBold','bold',false],['Italic','toggleItalic','italic',false],['Underline','toggleUnderline','underline',true],['Strike','toggleStrike','strike',true],['Inline code','toggleCode','code',false],['Bullets','toggleBulletList','bulletList',false],['Numbered list','toggleOrderedList','orderedList',false],['Quote','toggleBlockquote','blockquote',false]]){
  tool(name,e=>e.chain().focus()[cmd]().run(),{pressed:e=>e.isActive(mark),richOnly:only});
 }
 tool('Indent list',e=>e.chain().focus().sinkListItem('listItem').run(),{richOnly:true,can:e=>e.can().sinkListItem('listItem')});
 tool('Outdent list',e=>e.chain().focus().liftListItem('listItem').run(),{richOnly:true,can:e=>e.can().liftListItem('listItem')});
 tool('Link',e=>{const url=window.prompt('HTTPS, HTTP or mailto link',e.getAttributes('link').href??'https://');if(url===null)return false;if(!safeLink(url)){note.textContent='Invalid or unsafe link.';return false;}e.chain().focus().extendMarkRange('link').setLink({href:url}).run();},{richOnly:true,pressed:e=>e.isActive('link')});
 tool('Remove link',e=>e.chain().focus().extendMarkRange('link').unsetLink().run(),{richOnly:true,can:e=>e.isActive('link')});
 tool('Insert table',e=>e.chain().focus().insertTable({rows:3,cols:3,withHeaderRow:true}).run(),{richOnly:true});
 for(const [name,cmd] of [['Add row','addRowAfter'],['Add column','addColumnAfter'],['Delete row','deleteRow'],['Delete column','deleteColumn'],['Delete table','deleteTable'],['Merge cells','mergeCells'],['Split cell','splitCell']])tool(name,e=>e.chain().focus()[cmd]().run(),{richOnly:true,can:e=>e.can()[cmd]()});
 tool('Undo',e=>e.chain().focus().undo().run(),{can:e=>e.can().undo()});
 tool('Redo',e=>e.chain().focus().redo().run(),{can:e=>e.can().redo()});
 mode(false);refresh();
 if(rich)enter();
 return {get blocked(){return blocked||composing;},get active(){return active;},get rich(){return rich;}};
}
