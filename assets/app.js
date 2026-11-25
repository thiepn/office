import {openOffice} from './store.js';
import {mountVisual} from './visual.js';
import {selectDocuments,filename,Conflict} from './model.js';
const root=document.querySelector('#app'),boot=document.querySelector('#boot');
let store;
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(label,fn,cls)=>{const b=el('button',label,cls);b.type='button';b.addEventListener('click',fn);return b;};
const link=(label,href)=>{const a=el('a',label);a.href=href;return a;};
const date=iso=>new Date(iso).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
const docURL=id=>'/docs/?id='+encodeURIComponent(id);
function statusNode(){const p=el('p','','status');p.setAttribute('role','status');p.setAttribute('aria-live','polite');return p;}
function status(node,msg,error=false){node.textContent=msg;node.dataset.error=String(error);}
function download(title,body){const url=URL.createObjectURL(new Blob([body],{type:'text/markdown;charset=utf-8'}));const a=link('',url);a.download=filename(title);document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function library(){
 const hero=el('div',undefined,'hero'),intro=el('div');intro.append(el('div','Workspace / Documents','eyebrow'),el('h1','Your documents'),el('p','Create, find and organize your writing.'));hero.append(intro);
 const state={query:'',sort:'recent',trash:false};let pending=false,generation=0;
 const message=statusNode(),newBtn=button('New document',async()=>{if(pending)return;pending=true;newBtn.disabled=true;try{const d=await store.add('Untitled document','');location.assign(docURL(d.id));}catch(e){status(message,e.message,true);pending=false;newBtn.disabled=false;}},'primary');hero.append(newBtn);
 const tools=el('div',undefined,'toolbar'),search=el('input');search.type='search';search.placeholder='Search documents';search.setAttribute('aria-label','Search documents');search.maxLength=120;
 const sort=el('select');sort.setAttribute('aria-label','Sort documents');for(const [v,label] of [['recent','Recently edited'],['title','Title A–Z']]){const o=el('option',label);o.value=v;sort.append(o);}
 const tabs=el('div',undefined,'tabs'),active=button('Documents',()=>switchTab(false)),trash=button('Trash',()=>switchTab(true));tabs.append(active,trash);tools.append(search,sort,tabs);
 const list=el('section',undefined,'library');list.setAttribute('aria-label','Document list');root.append(hero,tools,message,list);
 function switchTab(value){state.trash=value;render();}
 search.addEventListener('input',()=>{state.query=search.value;render();});sort.addEventListener('change',()=>{state.sort=sort.value;render();});
 async function mutate(b,work){
  if(b.disabled)return;const row=b.closest('article'),id=row?.dataset.documentId;
  b.disabled=true;
  try{await work();await render();
   // A completed action replaces the old row. Restore a meaningful keyboard target.
   if(document.activeElement===document.body||document.activeElement===b){
    const replacement=[...list.querySelectorAll('article')].find(n=>n.dataset.documentId===id);
    (replacement?.querySelector('a,button')??(state.trash?trash:active)).focus();
   }
  }catch(e){status(message,e.message,true);b.disabled=false;b.focus();}finally{b.disabled=false;}
 }
 async function render(){
  const run=++generation;active.setAttribute('aria-pressed',String(!state.trash));trash.setAttribute('aria-pressed',String(state.trash));
  try{const rows=selectDocuments(await store.list(),state);if(run!==generation)return;list.replaceChildren();status(message,rows.length+' '+(rows.length===1?'document':'documents'));
   if(!rows.length){const empty=el('div',undefined,'empty');empty.append(el('h2',state.query?'No matching documents':state.trash?'Trash is empty':'Start your first document'),el('p',state.query?'Try another search.':state.trash?'Deleted documents can be restored here.':'Use New document to start writing.'));list.append(empty);return;}
   for(const d of rows){const row=el('article',undefined,'doc'),main=el('div',undefined,'doc-main'),actions=el('div',undefined,'doc-actions');
    row.dataset.documentId=d.id;
    main.append(d.trashed?el('strong',d.title):link(d.title,docURL(d.id)),el('small',date(d.updatedAt)+' · revision '+d.revision));
    if(d.trashed){const restore=button('Restore',()=>mutate(restore,()=>store.save(d.id,d.revision,{trashed:false})));actions.append(restore);}
    else{const duplicate=button('Duplicate',()=>mutate(duplicate,()=>store.add(d.title.slice(0,113)+' (copy)',d.body)));const remove=button('Move to trash',()=>{if(confirm('Move this document to Trash? You can restore it later.'))mutate(remove,()=>store.save(d.id,d.revision,{trashed:true}));});actions.append(duplicate,button('Export',()=>download(d.title,d.body)),remove);}
    row.append(main,actions);list.append(row);
   }
  }catch(e){if(run===generation)status(message,e.message,true);}
 }
 await render();
 window.addEventListener('focus',()=>{if(!list.contains(document.activeElement))render();});
}
async function editor(){
 const id=new URLSearchParams(location.search).get('id');let doc=id&&await store.get(id);
 if(!doc||doc.trashed){root.append(el('h1','Document unavailable'),el('p','This document does not exist in this browser or is in Trash.'),link('Return to your documents','/'));return;}
 const head=el('div',undefined,'editor-top'),titleWrap=el('label',undefined,'title-wrap'),title=el('input',undefined,'title-input');title.maxLength=120;title.value=doc.title;titleWrap.append(el('span','Document title'),title);
 const actions=el('div',undefined,'editor-actions'),msg=statusNode(),grid=el('div',undefined,'editor-grid'),paper=el('section',undefined,'paper'),body=el('textarea');body.id='document-body';body.value=doc.body;body.maxLength=200000;body.spellcheck=true;const label=el('label','Document (Markdown)');label.htmlFor=body.id;paper.append(label,body);
 const side=el('aside',undefined,'side'),stats=el('p'),history=el('ol');side.append(el('h2','Document details'),stats,el('h2','Saved revisions'),history);
 let timer,busy=false,conflict=false,dirty=false,visual;
 const exportBtn=button('Export Markdown',()=>download(title.value,body.value));
 const reload=button('Reload saved version',async()=>{if(!confirm('Discard unsaved local edits and reload the stored version?'))return;clearTimeout(timer);dirty=false;location.reload();});reload.hidden=true;
 const save=button('Save',()=>persist(),'primary');
 actions.append(save,exportBtn);head.append(titleWrap,actions);side.append(reload);grid.append(paper,side);root.append(link('← All documents','/'),el('h1','Document editor'),head,msg,grid);
 function info(){const words=body.value.trim()?body.value.trim().split(/\s+/).length:0;stats.textContent=words+' words · '+body.value.length+' characters · revision '+doc.revision;history.replaceChildren();for(const v of [...doc.history].reverse()){history.append(el('li','Revision '+v.revision+' · '+date(v.updatedAt)));}if(!doc.history.length)history.append(el('li','No previous revisions'));}
 function update(){dirty=title.value!==doc.title||body.value!==doc.body||!!visual?.blocked;info();save.disabled=busy||conflict||!dirty||!!visual?.blocked;exportBtn.disabled=!!visual?.blocked;}
 function change(){update();clearTimeout(timer);if(conflict)return;if(visual?.blocked){status(msg,'Unsupported or unfinished visual edits are not saved. Recover or correct the visual draft.',true);return;}if(dirty){status(msg,'Unsaved changes');timer=setTimeout(persist,700);}else if(!busy)status(msg,'Saved locally');}
 async function persist(){
  clearTimeout(timer);if(busy||conflict||!dirty||visual?.blocked)return;busy=true;update();const patch={title:title.value,body:body.value};
  status(msg,'Saving…');
  try{doc=await store.save(doc.id,doc.revision,patch);busy=false;update();if(visual?.blocked){status(msg,'Visual edits still need attention. Your last valid revision is retained.',true);}else if(dirty){status(msg,'Unsaved changes');timer=setTimeout(persist,700);}else status(msg,'Saved locally');}
  catch(e){busy=false;if(e instanceof Conflict){conflict=true;reload.hidden=false;status(msg,e.message+' Export your draft before reloading.',true);}else status(msg,e.message+' Your draft is still open.',true);update();}
 }
 visual=mountVisual({paper,body,label,onChange:change,onRecovery:text=>download(title.value+' (visual recovery)',text)});
 for(const field of [title,body])field.addEventListener('input',change);
 window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();persist();}});
 window.addEventListener('beforeunload',e=>{if(dirty||busy||visual?.blocked){e.preventDefault();e.returnValue='';}});
 info();update();status(msg,'Saved locally');
}
try{store=await openOffice();boot.hidden=true;root.hidden=false;if(location.pathname.startsWith('/docs'))await editor();else await library();}
catch(e){root.hidden=true;boot.hidden=false;boot.textContent='Office could not open local storage. '+e.message+' Existing data has not been deleted.';}
