import {Editor,getSchema} from '@tiptap/core';
import {Typography,ParagraphStyle} from './authoring-extensions.js';
import {FONTS,SIZES,COLORS,ALIGN,SPACING,DEFAULT_LAYOUT,validateLayout,pageWidth} from './authoring-format.js';
import StarterKit from '@tiptap/starter-kit';
import {TableKit} from '@tiptap/extension-table';
import {sourceToJSON,jsonToSource} from './visual.js';
import {safeLink,validateRich,richText} from './rich-format.js';
import {InlineEquation,DisplayEquation,selectedEquation,createEquationDialog} from './equation-extension.js';
import {equationSourceExport,equationInventory} from './equation-format.js';

function officeExtensions(){return [
   StarterKit.configure({heading:{levels:[1,2,3]},trailingNode:false,link:{openOnClick:false,autolink:false,linkOnPaste:false,HTMLAttributes:{target:'_blank',rel:'noopener noreferrer'},isAllowedUri:(url,ctx)=>safeLink(url)&&ctx.defaultValidate(url)}}),
   TableKit.configure({table:{resizable:false}}),
  Typography,ParagraphStyle,InlineEquation,DisplayEquation];}
export function validateStructuredImport(rich){
 validateRich(rich);const schema=getSchema(officeExtensions());const node=schema.nodeFromJSON(rich.content);node.check();
 // Reject a payload that would lose any supplied node or mark attributes.
 function preserved(input,output){if(input.type!==output.type||input.text!==output.text)return false;for(const [k,v] of Object.entries(input.attrs??{}))if(JSON.stringify(v)!==JSON.stringify(output.attrs?.[k]))return false;for(const field of ['content','marks']){const x=input[field]??[],y=output[field]??[];if(x.length!==y.length||x.some((v,i)=>!preserved(v,y[i])))return false;}return true;}
 if(!preserved(rich.content,node.toJSON()))throw new Error('Structured file does not round-trip through the editor schema.');
 return rich;
}
export function mountVisual({paper,body,label,onChange,onRecovery,onRichExport,initialRich,onPrintTitle,onEquationExport}){
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
 const recovery=button('Export visual recovery text',()=>onRecovery(editor?richText(editor.getJSON()):''));recovery.hidden=true;
 const structuredExport=button('Export structured JSON',()=>{if(rich)onRichExport(rich);});structuredExport.hidden=true;
 const ribbon=el('div');ribbon.className='office-ribbon';const typography=el('div');typography.className='authoring-controls';const pageSettings=el('div');pageSettings.className='authoring-controls';const outline=el('nav');outline.className='document-outline';outline.setAttribute('aria-label','Document outline');const outlineTitle=el('h2','Document outline');const outlineList=el('div');outline.append(outlineTitle,outlineList);const work=el('div');work.className='visual-work';work.append(outline,frame);ribbon.append(tools,typography,pageSettings);panel.append(ribbon,work,recovery);paper.prepend(controls,note,structuredExport);paper.append(panel);
 let active=false,blocked=false,editor=null,rich=initialRich??null,composing=false,selectionControls=[],layout=initialRich?.layout??null;
 const equationDialog=createEquationDialog(doc,panel,message=>{note.textContent=message;},content=>validateRich({...rich,content}));
 const equationExport=button('Export equation sources',()=>{if(rich&&onEquationExport)onEquationExport(equationSourceExport(rich.content));});tools.append(equationExport);
 const layoutStyle=el('style');layoutStyle.dataset.officePrint='';doc.head.append(layoutStyle);
 function applyLayout(){const p=layout??DEFAULT_LAYOUT;frame.style.setProperty('--office-page-width',pageWidth(p)+'mm');frame.style.setProperty('--office-margin',p.margin+'mm');layoutStyle.textContent='@page { size: '+p.paper+' '+p.orientation+'; margin: '+p.margin+'mm; }';}
 function refreshOutline(){outlineList.replaceChildren();if(!editor)return;editor.state.doc.descendants((n,pos)=>{if(n.type.name!=='heading')return;const b=button(n.textContent||'Untitled heading',()=>{editor.chain().focus().setTextSelection(pos+1).run();const dom=editor.view.nodeDOM(pos);if(dom?.nodeType===1)dom.scrollIntoView({block:'nearest'});});b.className='outline-heading';b.dataset.level=String(n.attrs.level);outlineList.append(b);});if(!outlineList.children.length)outlineList.append(el('p','Add headings to navigate your document.'));}

 function mode(v){active=v;body.hidden=v;label.hidden=v;body.readOnly=!!rich;panel.hidden=!v;source.setAttribute('aria-pressed',String(!v));visual.setAttribute('aria-pressed',String(v));convert.hidden=!!rich;structuredExport.hidden=!rich;typography.hidden=!rich;pageSettings.hidden=!rich;applyLayout();}
 function error(v,message){blocked=v;recovery.hidden=!v;note.textContent=message;editor?.view.dom.setAttribute('aria-invalid',String(v));}
 function refresh(){
  equationExport.hidden=!rich||!editor||!active||!equationInventory(rich.content).length;
  for(const item of selectionControls){item.b.hidden=item.richOnly&&!rich;item.b.disabled=!editor||!active||composing||!!item.can&&!item.can(editor);if(item.pressed)item.b.setAttribute('aria-pressed',String(!!editor&&item.pressed(editor)));}
  if(editor&&active){for(const {select,read} of styleInputs)select.value=String(read(editor)??'');}
 }
 function sync(){
  if(!active||!editor||composing)return;
  try{
   const content=editor.getJSON();editor.state.doc.check();
   if(rich){const next={version:1,originalMarkdown:rich.originalMarkdown,content,...(layout?{layout}:{})};validateRich(next);rich=next;error(false,'Structured document · original Markdown is preserved.');onChange();}
   else{const next=jsonToSource(doc,content);error(false,'Visual mode · basic formatting is saved as Markdown.');if(body.value!==next){body.value=next;body.dispatchEvent(new Event('input',{bubbles:true}));}else onChange();}
  }catch(e){error(true,'Unsupported formatting. Unsaved visual edits are retained here. Export recovery text or correct the formatting.');onChange();}
  refresh();refreshOutline();
 }
 function setup(content){
  editor?.destroy();editor=null;
  editor=new Editor({element:host,extensions:officeExtensions(),content,enableContentCheck:true,editorProps:{
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
   mode(true);error(false,rich?'Structured document · original Markdown is preserved.':'Visual mode · basic formatting is saved as Markdown.');refresh();refreshOutline();editor.commands.focus('start');
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
 tool('Insert inline equation',e=>{equationDialog.open(e,'inlineEquation');return false;},{richOnly:true});
 tool('Insert display equation',e=>{equationDialog.open(e,'displayEquation');return false;},{richOnly:true});
 tool('Edit selected equation',e=>{const selection=selectedEquation(e);if(selection)equationDialog.open(e,selection.node.type.name,selection);return false;},{richOnly:true,can:e=>!!selectedEquation(e)});
 tool('Insert table',e=>e.chain().focus().insertTable({rows:3,cols:3,withHeaderRow:true}).run(),{richOnly:true});
 for(const [name,cmd] of [['Add row','addRowAfter'],['Add column','addColumnAfter'],['Delete row','deleteRow'],['Delete column','deleteColumn'],['Delete table','deleteTable'],['Merge cells','mergeCells'],['Split cell','splitCell']])tool(name,e=>e.chain().focus()[cmd]().run(),{richOnly:true,can:e=>e.can()[cmd]()});
 tool('Undo',e=>e.chain().focus().undo().run(),{can:e=>e.can().undo()});
 tool('Redo',e=>e.chain().focus().redo().run(),{can:e=>e.can().redo()});
 const styleInputs=[];
 function choose(container,name,options,change,read){
  const wrap=el('label'),select=el('select');wrap.append(el('span',name),select);select.setAttribute('aria-label',name);
  for(const [v,t] of options){const opt=el('option',t);opt.value=String(v);select.append(opt);}
  select.addEventListener('change',()=>{if(!active||!editor||composing||!rich)return;change(select.value,editor);sync();});
  container.append(wrap);if(read)styleInputs.push({select,read});return select;
 }
 function setType(key,value,e){const attrs={...e.getAttributes('typography'),[key]:value};if(Object.values(attrs).every(x=>x==null))e.chain().focus().unsetMark('typography').run();else e.chain().focus().setMark('typography',attrs).run();}
 choose(typography,'Font family',[['','Default'],['serif','Serif'],['sans','Sans serif'],['mono','Monospace']],(v,e)=>setType('font',v||null,e),e=>e.getAttributes('typography').font);
 choose(typography,'Font size',[['','Default'],...SIZES.map(n=>[n,n+' pt'])],(v,e)=>setType('size',v?Number(v):null,e),e=>e.getAttributes('typography').size);
 choose(typography,'Text color',[['','Default'],...Object.keys(COLORS).map(v=>[v,v[0].toUpperCase()+v.slice(1)])],(v,e)=>setType('color',v||null,e),e=>e.getAttributes('typography').color);
 function paragraphAttr(key,value,e){const type=e.isActive('heading')?'heading':'paragraph';e.chain().focus().updateAttributes(type,{[key]:value}).run();}
 choose(typography,'Alignment',[['','Default'],...ALIGN.map(x=>[x,x])],(v,e)=>paragraphAttr('officeAlign',v||null,e),e=>e.getAttributes(e.isActive('heading')?'heading':'paragraph').officeAlign);
 choose(typography,'Line spacing',[['','Default'],...SPACING.map(x=>[x,String(x)])],(v,e)=>paragraphAttr('officeSpacing',v?Number(v):null,e),e=>e.getAttributes(e.isActive('heading')?'heading':'paragraph').officeSpacing);
 function pageChange(key,value){layout=validateLayout({...DEFAULT_LAYOUT,...layout,[key]:value});applyLayout();}
 const paperSize=choose(pageSettings,'Paper size',[['A4','A4'],['Letter','US Letter']],v=>pageChange('paper',v));
 const orientation=choose(pageSettings,'Orientation',[['portrait','Portrait'],['landscape','Landscape']],v=>pageChange('orientation',v));
 const margins=choose(pageSettings,'Margins',[[12,'12 mm'],[20,'20 mm'],[25,'25 mm'],[30,'30 mm']],v=>pageChange('margin',Number(v)));
 paperSize.value=(layout??DEFAULT_LAYOUT).paper;orientation.value=(layout??DEFAULT_LAYOUT).orientation;margins.value=String((layout??DEFAULT_LAYOUT).margin);
 const print=button('Print / Save PDF',()=>{if(!active||!editor||blocked||composing)return;const old=doc.title;doc.title=onPrintTitle?.()||old;doc.body.classList.add('office-printing');const clean=()=>{doc.body.classList.remove('office-printing');doc.title=old;};window.addEventListener('afterprint',clean,{once:true});try{window.print();}catch{clean();}});pageSettings.append(print);
 tool('Toggle header row',e=>e.chain().focus().toggleHeaderRow().run(),{richOnly:true,can:e=>e.can().toggleHeaderRow()});
 tool('Toggle header column',e=>e.chain().focus().toggleHeaderColumn().run(),{richOnly:true,can:e=>e.can().toggleHeaderColumn()});
 mode(false);refresh();
 if(rich)enter();
 return {get blocked(){return blocked||composing;},get active(){return active;},get rich(){return rich;}};
}
