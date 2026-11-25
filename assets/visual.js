// O3.1: a deliberately bounded, lossless Markdown bridge.
// No stored HTML, no HTML parsing, no schema/database migration.
const unsupported=()=>new Error('This formatting is not supported in visual mode. Use Markdown source for advanced syntax.');
function plain(text){
 if (/[\x00-\x08\x0b-\x1f*_\x60\\<>\[\]~|]/u.test(text)||/&(?:#\d+|#x[\da-f]+|[a-z]+);/i.test(text))throw unsupported();
 return text;
}
function inline(doc,text){
 const frag=doc.createDocumentFragment();
 const tokens=/\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|\x60([^\x60\n]+)\x60/g;
 let end=0;
 for(const m of text.matchAll(tokens)){
  frag.append(doc.createTextNode(plain(text.slice(end,m.index))));
  const tag=m[1]!==undefined?'strong':m[2]!==undefined?'em':'code',value=m[1]??m[2]??m[3];
  if(!value.trim()||value.trim()!==value)throw unsupported();
  const n=doc.createElement(tag);n.textContent=tag==='code'?value:plain(value);frag.append(n);end=m.index+m[0].length;
 }
 frag.append(doc.createTextNode(plain(text.slice(end))));return frag;
}
function block(doc,tag,text){
 const n=doc.createElement(tag);n.append(inline(doc,text));if(!text)n.append(doc.createElement('br'));return n;
}
export function markdownToVisual(doc,source){
 if(source.length>200000||source.includes('\r'))throw unsupported();
 const frag=doc.createDocumentFragment();
 for(const chunk of source.split('\n\n')){
  if(!chunk){frag.append(block(doc,'p',''));continue;}
  const lines=chunk.split('\n');
  if(lines.every(s=>s.startsWith('- ')&&s.length>2)){
   const list=doc.createElement('ul');for(const line of lines)list.append(block(doc,'li',line.slice(2)));frag.append(list);continue;
  }
  if(lines.every((s,i)=>s.startsWith((i+1)+'. ')&&s.length>((i+1)+'. ').length)){
   const list=doc.createElement('ol');for(const [i,line] of lines.entries())list.append(block(doc,'li',line.slice(((i+1)+'. ').length)));frag.append(list);continue;
  }
  if(lines.length!==1||chunk.trim()!==chunk)throw unsupported();
  const heading=/^(#{1,3}) (.+)$/.exec(chunk);
  if(heading){frag.append(block(doc,'h'+heading[1].length,heading[2]));continue;}
  if(chunk.startsWith('> ')&&chunk.length>2){frag.append(block(doc,'blockquote',chunk.slice(2)));continue;}
  if(/^(?:#|>|[-+]\s|\d+[.)]\s|---|===|!\[)/.test(chunk))throw unsupported();
  frag.append(block(doc,'p',chunk));
 }
 return frag;
}
function inlineNode(n){
 if(n.nodeType===3)return plain(n.nodeValue);
 if(n.nodeType!==1)throw unsupported();
 const tag=n.tagName;
 if(n.attributes.length)throw unsupported();
 if(tag==='BR')throw unsupported();
 if(tag==='CODE'){
  const value=n.textContent;if(n.children.length||!value||value.trim()!==value||/[\x60\r\n]/.test(value))throw unsupported();
  return '\x60'+value+'\x60';
 }
 const value=Array.from(n.childNodes,inlineNode).join('');
 if(tag==='SPAN')return value;
 if(!value||value.trim()!==value||value.includes('*'))throw unsupported();
 if(tag==='B'||tag==='STRONG')return '**'+value+'**';
 if(tag==='I'||tag==='EM')return '*'+value+'*';
 throw unsupported();
}
function inlineChildren(n){
 const nodes=Array.from(n.childNodes);
 if(nodes.length===1&&nodes[0].nodeName==='BR')return '';
 return nodes.map(inlineNode).join('');
}
function serializeBlock(n){
 if(n.attributes.length)throw unsupported();
 const tag=n.tagName;
 if(tag==='UL'||tag==='OL'){
  if(!n.children.length||Array.from(n.childNodes).some(c=>c.nodeType!==1||c.tagName!=='LI'||c.attributes.length))throw unsupported();
  return Array.from(n.children,(li,i)=>{const t=inlineChildren(li);if(!t||t.trim()!==t)throw unsupported();return (tag==='UL'?'- ':(i+1)+'. ')+t;}).join('\n');
 }
 const value=inlineChildren(n);
 if(value.trim()!==value)throw unsupported();
 if(tag==='P'||tag==='DIV')return value;
 if(/^H[1-3]$/.test(tag)&&value)return '#'.repeat(Number(tag[1]))+' '+value;
 if(tag==='BLOCKQUOTE'&&value)return '> '+value;
 throw unsupported();
}
export function visualToMarkdown(surface){
 const blocks=[];let inlineNodes=[];
 function flush(){if(inlineNodes.length){blocks.push(inlineNodes.map(inlineNode).join(''));inlineNodes=[];}}
 for(const n of surface.childNodes){
  if(n.nodeType===1&&/^(P|DIV|H[1-3]|BLOCKQUOTE|UL|OL)$/.test(n.tagName)){flush();blocks.push(serializeBlock(n));}
  else if(n.nodeType===1&&n.tagName==='BR'){flush();blocks.push('');}
  else inlineNodes.push(n);
 }
 flush();const md=blocks.join('\n\n');
 // A source-level validation pass prevents ambiguous or unsupported output.
 const check=markdownToVisual(surface.ownerDocument,md);
 if(md.length>200000||!check)throw unsupported();
 return md;
}
export function mountVisual({paper,body,label,onChange,onRecovery}){
 const doc=paper.ownerDocument;
 const create=(tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const controls=create('div');controls.className='visual-mode';
 const source=create('button','Markdown source'),visual=create('button','Visual editor (beta)');
 for(const b of [source,visual])b.type='button';
 controls.setAttribute('role','group');controls.setAttribute('aria-label','Editing mode');controls.append(source,visual);
 const note=create('p');note.className='visual-note';note.setAttribute('aria-live','polite');note.textContent='Markdown is the original document format. Visual mode supports basic formatting.';
 const panel=create('section');panel.className='visual-panel';panel.hidden=true;panel.setAttribute('aria-label','Visual authoring');
 const tools=create('div');tools.className='visual-toolbar';tools.setAttribute('role','group');tools.setAttribute('aria-label','Visual formatting');
 const frame=create('div');frame.className='visual-page-frame';
 const surface=create('div');surface.className='visual-page';surface.contentEditable='true';surface.setAttribute('role','textbox');surface.setAttribute('aria-label','Visual document');surface.setAttribute('aria-multiline','true');surface.spellcheck=true;
 frame.append(surface);
 const recovery=create('button','Export visual recovery text');recovery.type='button';recovery.hidden=true;recovery.addEventListener('click',()=>onRecovery(surface.innerText));
 panel.append(tools,frame,recovery);paper.prepend(controls,note);paper.append(panel);
 let active=false,blocked=false,selection=null,composing=false;
 function mode(value){
  active=value;body.hidden=value;label.hidden=value;panel.hidden=!value;
  source.setAttribute('aria-pressed',String(!value));visual.setAttribute('aria-pressed',String(value));
 }
 function setBlocked(value,message){
  blocked=value;recovery.hidden=!value;surface.setAttribute('aria-invalid',String(value));note.textContent=message;
 }
 function sync(){
  if(!active||composing)return;
  try{
   const next=visualToMarkdown(surface);
   setBlocked(false,'Visual mode · basic formatting is saved as Markdown.');
   if(body.value!==next){body.value=next;body.dispatchEvent(new Event('input',{bubbles:true}));}
   else onChange();
  }catch(e){setBlocked(true,e.message+' Unsaved visual edits are retained here. Export recovery text or correct the formatting.');onChange();}
 }
 function enter(){
  try{
   const parsed=markdownToVisual(doc,body.value);surface.replaceChildren(parsed);
   if(visualToMarkdown(surface)!==body.value)throw unsupported();
   setBlocked(false,'Visual mode · basic formatting is saved as Markdown.');mode(true);surface.focus();
  }catch(e){note.textContent=e.message+' Original Markdown remains unchanged.';mode(false);body.focus();}
 }
 source.addEventListener('click',()=>{
  if(!active)return;
  if(blocked&&!window.confirm('Discard only the unsupported visual edits and return to the last valid Markdown draft?'))return;
  setBlocked(false,'Markdown source · no formatting conversion is applied.');mode(false);onChange();body.focus();
 });
 visual.addEventListener('click',()=>{if(!active)enter();});
 doc.addEventListener('selectionchange',()=>{
  const s=doc.getSelection();if(active&&s?.rangeCount&&surface.contains(s.anchorNode)&&surface.contains(s.focusNode))selection=s.getRangeAt(0).cloneRange();
 });
 function command(name,value){
  if(!active||composing)return;
  surface.focus();const s=doc.getSelection();
  if(selection&&surface.contains(selection.commonAncestorContainer)){s.removeAllRanges();s.addRange(selection);}
  try{if(name!=='undo'&&name!=='redo')doc.execCommand('styleWithCSS',false,false);doc.execCommand(name,false,value??null);sync();}
  catch{note.textContent='This browser could not apply the selected formatting. Your document has not been replaced.';}
 }
 for(const [text,name,value] of [['Normal','formatBlock','p'],['Heading 1','formatBlock','h1'],['Heading 2','formatBlock','h2'],['Heading 3','formatBlock','h3'],['Bold','bold'],['Italic','italic'],['Bullets','insertUnorderedList'],['Numbered list','insertOrderedList'],['Quote','formatBlock','blockquote'],['Undo','undo'],['Redo','redo']]){
  const b=create('button',text);b.type='button';b.addEventListener('mousedown',e=>e.preventDefault());b.addEventListener('click',()=>command(name,value));tools.append(b);
 }
 surface.addEventListener('compositionstart',()=>{composing=true;});
 surface.addEventListener('compositionend',()=>{composing=false;sync();});
 surface.addEventListener('input',sync);
 surface.addEventListener('paste',e=>{e.preventDefault();const text=e.clipboardData?.getData('text/plain')??'';if(text)command('insertText',text);});
 surface.addEventListener('drop',e=>{e.preventDefault();note.textContent='Drag-and-drop content is not imported. Paste plain text or use Markdown source.';});
 mode(false);
 return {get blocked(){return blocked||composing;},get active(){return active;}};
}
