import {openOffice} from './store.js';
import {synchronizeWorkspace} from './incremental-sync.js';
import {mountMigrationPanel} from './migration-panel.js';
import {richText,parseStructuredFile} from './rich-format.js';
import {selectDocuments,filename,Conflict} from './model.js';
const root=document.querySelector('#app'),boot=document.querySelector('#boot');
let syncRunning=false;
let store,accountMode=false,accountController=null,accountRuntime=null,accountLocked=false,freezeEditor=null,syncRefresh=null,libraryRefresh=null;
const scopeRequested=new URLSearchParams(location.search).get('workspace')==='account';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(label,fn,cls)=>{const b=el('button',label,cls);b.type='button';b.addEventListener('click',fn);return b;};
const link=(label,href)=>{const a=el('a',label);a.href=href;return a;};
const date=iso=>new Date(iso).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
const libraryURL=()=>accountMode?'/?workspace=account':'/';
const docURL=id=>'/docs/?id='+encodeURIComponent(id)+(accountMode?'&workspace=account':'');
function statusNode(){const p=el('p','','status');p.setAttribute('role','status');p.setAttribute('aria-live','polite');return p;}
function status(node,msg,error=false){node.textContent=msg;node.dataset.error=String(error);}
function downloadBib(title,body){const url=URL.createObjectURL(new Blob([body],{type:'text/plain;charset=utf-8'}));const a=link('',url);a.download=filename(title).replace(/\.md$/,'.bib');document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function download(title,body,json=false){const url=URL.createObjectURL(new Blob([body],{type:json?'application/json':'text/markdown;charset=utf-8'}));const a=link('',url);a.download=json?filename(title).replace(/\.md$/,'.office.json'):filename(title);document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function library(){
 const hero=el('div',undefined,'hero'),intro=el('div');intro.append(el('div','Workspace / Documents','eyebrow'),el('h1','Your documents'),el('p','Create, find and organize your writing.'));hero.append(intro);
 const state={query:'',sort:'recent',trash:false};let pending=false,generation=0;
 const message=statusNode(),newBtn=button('New document',async()=>{if(pending)return;pending=true;newBtn.disabled=true;try{const d=await store.add('Untitled document','');location.assign(docURL(d.id));}catch(e){status(message,e.message,true);pending=false;newBtn.disabled=false;}},'primary');const importInput=el('input');importInput.type='file';importInput.accept='.json,application/json';importInput.hidden=true;const importBtn=button('Import structured document',()=>importInput.click());const heroActions=el('div',undefined,'editor-actions');heroActions.append(importBtn,newBtn,importInput);hero.append(heroActions);
 importInput.addEventListener('change',async()=>{const file=importInput.files?.[0];importInput.value='';if(!file||pending)return;pending=true;importBtn.disabled=true;newBtn.disabled=true;try{if(file.size>4000000)throw new Error('Structured file exceeds import limit.');const x=parseStructuredFile(await file.text());const {validateStructuredImport}=await import('./structured-bundle.js');validateStructuredImport(x.rich);if(!confirm('Import as a new document? Existing documents will not be changed.'))return;const d=await store.add(x.title,x.rich.originalMarkdown,x.rich);location.assign(docURL(d.id));}catch(e){status(message,e.message,true);}finally{pending=false;importBtn.disabled=false;newBtn.disabled=false;}});
 const tools=el('div',undefined,'toolbar'),search=el('input');search.type='search';search.placeholder='Search documents';search.setAttribute('aria-label','Search documents');search.maxLength=120;
 const sort=el('select');sort.setAttribute('aria-label','Sort documents');for(const [v,label] of [['recent','Recently edited'],['title','Title A–Z']]){const o=el('option',label);o.value=v;sort.append(o);}
 const tabs=el('div',undefined,'tabs'),active=button('Documents',()=>switchTab(false)),trash=button('Trash',()=>switchTab(true));tabs.append(active,trash);tools.append(search,sort,tabs);
 const archivePanel=el('section',undefined,'account-recovery');archivePanel.hidden=true;root.append(archivePanel);
 const list=el('section',undefined,'library');list.setAttribute('aria-label','Document list');root.append(hero,tools,message,list);
 function switchTab(value){state.trash=value;render();}
 search.addEventListener('input',()=>{state.query=search.value;render();});sort.addEventListener('change',()=>{state.sort=sort.value;render();});
 async function mutate(b,work){
  if(b.disabled)return;const row=b.closest('article'),id=row?.dataset.documentId;
  b.disabled=true;
  try{await work();await render();syncRefresh?.();
   // A completed action replaces the old row. Restore a meaningful keyboard target.
   if(document.activeElement===document.body||document.activeElement===b){
    const replacement=[...list.querySelectorAll('article')].find(n=>n.dataset.documentId===id);
    (replacement?.querySelector('a,button')??(state.trash?trash:active)).focus();
   }
  }catch(e){status(message,e.message,true);b.disabled=false;b.focus();}finally{b.disabled=false;}
 }
 async function render(){
  if(accountLocked)return;const run=++generation;active.setAttribute('aria-pressed',String(!state.trash));trash.setAttribute('aria-pressed',String(state.trash));
  try{const rows=selectDocuments(await store.list(),state);if(run!==generation||accountLocked)return;list.replaceChildren();status(message,rows.length+' '+(rows.length===1?'document':'documents'));
   if(accountMode){const archives=await store.listArchives();if(run!==generation||accountLocked)return;archivePanel.replaceChildren();archivePanel.hidden=!archives.length;if(archives.length){archivePanel.append(el('h2','Conflict recovery archive'));for(const a of archives){archivePanel.append(button('Export archived conflict '+a.documentId,()=>download('Office conflict archive',JSON.stringify(a,null,2),true)));}}}
   if(!rows.length){const empty=el('div',undefined,'empty');empty.append(el('h2',state.query?'No matching documents':state.trash?'Trash is empty':'Start your first document'),el('p',state.query?'Try another search.':state.trash?'Deleted documents can be restored here.':'Use New document to start writing.'));list.append(empty);return;}
   for(const d of rows){const row=el('article',undefined,'doc'),main=el('div',undefined,'doc-main'),actions=el('div',undefined,'doc-actions');
    row.dataset.documentId=d.id;
    main.append(d.trashed?el('strong',d.title):link(d.title,docURL(d.id)),el('small',date(d.updatedAt)+' · revision '+d.revision));
    if(d.trashed){const restore=button('Restore',()=>mutate(restore,()=>store.save(d.id,d.revision,{trashed:false},accountMode?d:undefined)));actions.append(restore);}
    else{const duplicate=button('Duplicate',()=>mutate(duplicate,()=>store.add(d.title.slice(0,113)+' (copy)',d.body,d.rich)));const remove=button('Move to trash',()=>{if(confirm('Move this document to Trash? You can restore it later.'))mutate(remove,()=>store.save(d.id,d.revision,{trashed:true},accountMode?d:undefined));});actions.append(duplicate,button('Export',()=>d.rich?download(d.title,JSON.stringify({kind:'thiepn-office-structured',title:d.title,rich:d.rich},null,2),true):download(d.title,d.body)),remove);}
    if(accountMode){const sync=await store.inspect(d.id);if(accountLocked||run!==generation)return;main.append(el('small',sync?.conflict?'Cloud conflict — both versions retained':sync?.pending.length?'Pending synchronization':'Up to date locally'));if(sync?.conflict){
 actions.append(button('Export conflict recovery',()=>download(d.title+' conflict recovery',JSON.stringify({kind:'thiepn-office-conflict',local:sync.doc,remote:sync.conflict.document,pending:sync.pending},null,2),true)));
 const details=el('details',undefined,'conflict-review');details.append(el('summary','Resolve cloud conflict'));
 const versions=el('div',undefined,'conflict-versions');
 for(const [name,record] of [['Local',sync.doc],['Cloud at conflict',sync.conflict.document]]){const section=el('section');section.append(el('h3',name),el('p',record?record.title+' · revision '+record.revision:'No cloud document'),el('pre',record?(record.rich?richText(record.rich.content):record.body):''));versions.append(section);}
 details.append(versions,el('p','The current cloud version is checked again before resolution. All divergent versions and queued operations are archived locally.'));
 for(const [choice,label] of [['remote','Keep cloud version'],['fork','Keep local as separate document'],['local','Apply local as new cloud revision']]){
  const action=button(label,async()=>{if(accountLocked||syncRunning)return;action.disabled=true;try{
   const current=await accountController.verify();if(accountLocked||current!==store||accountController.state!=='connected')throw Error('Reconnect before resolving a conflict.');
   const latest=await accountRuntime.transport.pull(store.owner,d.id);if(accountLocked)return;
   // Do not act on a cloud version the user has not reviewed.
   const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
   if(JSON.stringify(canonical(latest))!==JSON.stringify(canonical(sync.conflict.document))){
    if(!confirm('Cloud version changed since this conflict. Review the refreshed versions before resolving. Refresh now?'))return;
    await store.refreshConflict(d.id,sync,latest);await render();return;
   }
   if(!confirm(label+'? A complete local recovery archive will be retained.'))return;
   if(accountLocked)return;await store.resolveConflict(d.id,sync,choice,latest);await render();syncRefresh?.();
  }catch(e){if(!accountLocked)status(message,e.message,true);}finally{action.disabled=false;}});
  details.append(action);
 }
 actions.append(details);
}}row.append(main,actions);list.append(row);
   }
  }catch(e){if(run===generation)status(message,e.message,true);}
 }
 if(accountMode){const drafts=await store.listDrafts();if(accountLocked)return;if(drafts.length){const recovery=el('section',undefined,'account-recovery');recovery.append(el('h2','Recovered unsaved drafts'));for(const item of drafts){recovery.append(button('Export draft '+item.draft.documentId,()=>download('Office recovery',JSON.stringify(item.draft,null,2),true)));}root.prepend(recovery);}}
 if(accountMode){root.prepend(mountMigrationPanel({store,transport:accountRuntime.transport,verify:async()=>{const current=await accountController.verify();return current===store&&accountController.state==='connected';},active:()=>!accountLocked,download,onChange:render}));}
 libraryRefresh=render;await render();
 window.addEventListener('focus',()=>{if(!list.contains(document.activeElement))render();});
}
async function editor(){
 const id=new URLSearchParams(location.search).get('id');let doc=id&&await store.get(id);
 if(accountLocked)return;
 if(!doc||doc.trashed){root.append(el('h1','Document unavailable'),el('p','This document does not exist in this browser or is in Trash.'),link('Return to your documents',libraryURL()));return;}
 const {mountVisual}=await import('./structured-bundle.js');if(accountLocked)return;
 const head=el('div',undefined,'editor-top'),titleWrap=el('label',undefined,'title-wrap'),title=el('input',undefined,'title-input');title.maxLength=120;title.value=doc.title;titleWrap.append(el('span','Document title'),title);
 const actions=el('div',undefined,'editor-actions'),msg=statusNode(),grid=el('div',undefined,'editor-grid'),paper=el('section',undefined,'paper'),body=el('textarea');body.id='document-body';body.value=doc.body;body.maxLength=200000;body.spellcheck=true;const label=el('label','Document (Markdown)');label.htmlFor=body.id;paper.append(label,body);
 const side=el('aside',undefined,'side'),stats=el('p'),history=el('ol');side.append(el('h2','Document details'),stats,el('h2','Saved revisions'),history);
 let timer,busy=false,conflict=false,dirty=false,visual,discarding=false,draftSequence=0,draftFlight=Promise.resolve();
 const draftId=accountMode?crypto.randomUUID():null;
 const capture=()=>({kind:'thiepn-office-unsaved-draft',documentId:doc.id,baseRevision:doc.revision,title:title.value,body:body.value,rich:visual?.rich??null,recoveryText:visual?.blocked?paper.querySelector('.visual-page')?.innerText??'':null,recordedAt:new Date().toISOString()});
 function queueDraft(){if(!accountMode||accountLocked)return;const sequence=++draftSequence,workspace=store,snapshot=capture();draftFlight=draftFlight.catch(()=>{}).then(()=>workspace.saveDraft(draftId,snapshot)).catch(()=>{if(sequence===draftSequence&&!accountLocked)status(msg,'Draft recovery storage unavailable. Export before leaving.',true);});}
 function clearOwnDraft(){if(!accountMode||accountLocked)return;const workspace=store;++draftSequence;draftFlight=draftFlight.catch(()=>{}).then(()=>workspace.clearDraft(draftId)).catch(()=>{});}
 freezeEditor=()=>{if(!accountMode||!dirty&&!busy&&!visual?.blocked)return Promise.resolve();clearTimeout(timer);const snapshot=capture(),workspace=store;return draftFlight.catch(()=>{}).then(()=>workspace.saveDraft(draftId,snapshot));};
 const exportBtn=button('Export Markdown',()=>download(title.value,body.value));
 const reload=button('Reload saved version',async()=>{if(!confirm('Discard unsaved local edits and reload the stored version?'))return;clearTimeout(timer);dirty=false;discarding=true;location.reload();});reload.hidden=true;
 const save=button('Save',()=>persist(),'primary');
 actions.append(save,exportBtn);head.append(titleWrap,actions);side.append(reload);grid.append(paper,side);root.append(link('← All documents',libraryURL()),el('h1','Document editor'),head,msg,grid);
 function info(){const current=visual?.rich?richText(visual.rich.content):body.value;const words=current.trim()?current.trim().split(/\s+/).length:0;stats.textContent=words+' words · '+current.length+' characters · revision '+doc.revision;history.replaceChildren();for(const v of [...doc.history].reverse()){history.append(el('li','Revision '+v.revision+' · '+date(v.updatedAt)));}if(!doc.history.length)history.append(el('li','No previous revisions'));}
 function update(){dirty=title.value!==doc.title||body.value!==doc.body||JSON.stringify(visual?.rich??null)!==JSON.stringify(doc.rich??null)||!!visual?.blocked;exportBtn.textContent=visual?.rich?'Export original Markdown':'Export Markdown';info();save.disabled=busy||conflict||!dirty||!!visual?.blocked;exportBtn.disabled=!!visual?.blocked;}
 function change(){if(accountLocked)return;update();if(dirty)queueDraft();clearTimeout(timer);if(conflict)return;if(visual?.blocked){status(msg,'Unsupported or unfinished visual edits are not saved. Recover or correct the visual draft.',true);return;}if(dirty){status(msg,'Unsaved changes');timer=setTimeout(persist,700);}else if(!busy)status(msg,'Saved locally');}
 async function persist(){
  clearTimeout(timer);if(accountLocked||busy||conflict||!dirty||visual?.blocked)return;busy=true;update();const patch={title:title.value,body:body.value,...(visual?.rich?{rich:visual.rich}:{})};
  status(msg,'Saving…');
  try{doc=await store.save(doc.id,doc.revision,patch,accountMode?doc:undefined);busy=false;if(accountLocked)return;update();if(!dirty)clearOwnDraft();syncRefresh?.();if(visual?.blocked){status(msg,'Visual edits still need attention. Your last valid revision is retained.',true);}else if(dirty){status(msg,'Unsaved changes');timer=setTimeout(persist,700);}else status(msg,'Saved locally');}
  catch(e){busy=false;if(accountLocked)return;if(e instanceof Conflict){conflict=true;reload.hidden=false;status(msg,e.message+' Export your draft before reloading.',true);}else status(msg,e.message+' Your draft is still open.',true);update();}
 }
 visual=mountVisual({paper,body,label,initialRich:doc.rich,onPrintTitle:()=>title.value,onEquationExport:text=>download(title.value+' (equations)',text),onBibExport:text=>downloadBib(title.value+' (references)',text),onChange:()=>{if(visual)change();},onRecovery:text=>download(title.value+' (visual recovery)',text),onRichExport:rich=>download(title.value,JSON.stringify({kind:'thiepn-office-structured',title:title.value,rich},null,2),true)});
 for(const field of [title,body])field.addEventListener('input',change);
 window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();persist();}});
 window.addEventListener('beforeunload',e=>{if(!discarding&&!accountLocked&&(dirty||busy||visual?.blocked)){e.preventDefault();e.returnValue='';}});
 info();update();status(msg,'Saved locally');
}
export async function startOffice(runtime=null){
 accountRuntime=runtime;
 const header=document.querySelector('.top'),label=header.querySelector('.local'),nav=header.querySelector('.quiet');
 const panel=el('section',undefined,'account-panel'),message=el('p','Guest workspace · documents stay in this browser.');message.setAttribute('aria-live','polite');
 const controls=el('div',undefined,'account-actions');panel.append(message,controls);
 // No role=status added to guest UI (existing autosave and accessibility contract).
 header.after(panel);
 const guest=link('Guest workspace','/'),account=link('Account workspace','/?workspace=account');
 const connect=button('Connect THIEPN Account',async()=>{if(!runtime)return;try{await runtime.connect();}catch{message.textContent='Account connection unavailable. Local documents retained.';}});
 if(!runtime){connect.disabled=true;message.textContent='Guest workspace · Account activation is not enabled.';controls.append(connect);}
 else{
  controls.append(guest,account,connect);
  if(scopeRequested){
   const {workspaceSession}=await import('./workspace-session.js');
   accountController=workspaceSession(runtime,{onState:({state})=>{message.textContent=state==='connected'?'Account workspace · connected':state==='offline'?'Offline · edits remain local':state==='unavailable'?'Account unavailable · private workspace locked':'Account workspace · '+state;},onLock:(reason,previous)=>{
    accountLocked=true;root.hidden=true;root.inert=true;clearInterval(poll);
    const pending=freezeEditor?.();root.replaceChildren();boot.hidden=false;boot.textContent='Account workspace locked. Reconnect to the same account to recover local drafts.';
    return Promise.resolve(pending).catch(()=>{boot.textContent='Account workspace locked. Latest recovery write failed; earlier saved revisions and recovery records remain available after reconnection.';throw Error('Recovery storage unavailable.');});
   }});
   store=await accountController.verify();
   if(!store){boot.hidden=false;boot.textContent='Verify your THIEPN Account before opening private documents.';root.hidden=true;return;}
   accountMode=true;label.textContent='Account workspace';nav.href=libraryURL();document.querySelector('footer').textContent='Account workspace · local drafts and explicit synchronization. No automatic Hub migration.';
   const sync=button('Synchronize now',async()=>{if(sync.disabled||accountLocked||syncRunning)return;sync.disabled=true;syncRunning=true;try{
     const current=await accountController.verify();if(current!==store||accountController.state!=='connected'||accountLocked)return;
     const {remaining,conflicts}=await synchronizeWorkspace(store,runtime.transport,{discover:!!libraryRefresh,active:()=>!accountLocked});
     if(!accountLocked&&libraryRefresh)await libraryRefresh();
     if(!accountLocked)message.textContent=conflicts?'Cloud conflict · '+conflicts+' document(s); both versions retained.':remaining?'Pending synchronization · '+remaining:'Synchronized queued changes.';
    }catch{if(!accountLocked)message.textContent='Synchronization unavailable · local edits and queue retained.';}finally{sync.disabled=false;syncRunning=false;}});
   const disconnect=button('Disconnect account',async()=>{if(!confirm('Disconnect this Office session? Saved documents and recovery drafts remain in its private local workspace.'))return;try{await freezeEditor?.();}catch{message.textContent='Recovery storage unavailable. Export the unsaved draft before disconnecting.';return;}try{await accountController.disconnect();}catch{message.textContent='Account disconnected; recovery storage needs attention.';}location.assign('/');});
   controls.append(sync,disconnect);connect.hidden=true;
   syncRefresh=()=>{if(!accountLocked)message.textContent='Saved on this device · synchronization pending';};
   poll=setInterval(()=>{if(!accountLocked)void accountController.verify().catch(()=>{});},15000);
   window.addEventListener('online',()=>{if(!accountLocked)void accountController.verify().catch(()=>{});});
   window.addEventListener('offline',()=>{if(!accountLocked)message.textContent='Offline · edits remain local';});
   window.addEventListener('storage',()=>{if(!accountLocked)void accountController.verify().catch(()=>{});});
   window.addEventListener('focus',()=>{if(!accountLocked)void accountController.verify().catch(()=>{});});
  }
 }
 if(!accountMode){if(scopeRequested){root.hidden=true;boot.hidden=false;boot.textContent='Account activation is disabled. Return to the guest workspace.';boot.append(' ',link('Guest workspace','/'));return;}store=await openOffice();}
 boot.hidden=true;root.hidden=false;if(location.pathname.startsWith('/docs'))await editor();else await library();
}
let poll;
export function showBootError(e){root.hidden=true;boot.hidden=false;boot.textContent='Office could not open local storage. Existing data has not been deleted.';}

