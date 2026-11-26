import {createPortableBackup,parsePortableBackup,migrationPlan,makeBatch,MAX_BACKUP_BYTES} from './portable-backup.js';
import {beginMigration,resumeMigration} from './migration-recovery.js';
export function mountMigrationPanel({store,transport,verify,active,download,onChange}){
 const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 const panel=el('details');panel.className='account-recovery migration-panel';panel.append(el('summary','Migration and document backups'));
 const note=el('p','Portable backups contain saved documents and their retained revision history, not unsaved drafts, mutation queues, conflict archives or account credentials. Export those recovery records separately. Files are unencrypted; fingerprints detect corruption, not authorship.');
 const message=el('p');message.setAttribute('aria-live','polite');
 const input=el('input');input.type='file';input.accept='.json,application/json';input.setAttribute('aria-label','Select portable backup');
 const confirmation=el('input');confirmation.type='text';confirmation.autocomplete='off';confirmation.setAttribute('aria-label','Confirm source owner scope');confirmation.disabled=true;
 const preview=el('div');const jobs=el('section');jobs.append(el('h3','Migration recovery jobs'));
 let backup=null,busy=false;
 const controls=[];const action=(name,fn)=>{const b=el('button',name);b.type='button';controls.push(b);b.addEventListener('click',()=>void run(fn));return b;};
 function assertActive(){if(!active())throw Error('Account workspace changed.');}
 async function connected(){assertActive();if(!await verify())throw Error('Reconnect to the same verified account.');assertActive();}
 async function run(fn){if(busy||!active())return;busy=true;for(const b of controls)b.disabled=true;try{await fn();}catch(e){if(active())message.textContent=e.message||'Operation failed. Recovery data retained.';}finally{busy=false;if(active()){for(const b of controls)b.disabled=false;start.disabled=!backup;}}}
 const exportBtn=action('Export document backup',async()=>{
  await connected();const docs=await store.list();assertActive();
  const out=await createPortableBackup('office','user:'+store.owner,docs);assertActive();
  download('Office document backup',JSON.stringify(out),true);message.textContent='Portable document backup exported.';
 });
 async function refreshJobs(){
  const records=await store.listMigrations();assertActive();jobs.replaceChildren(el('h3','Migration recovery jobs'));
  for(const job of records){
   const row=el('div');row.append(el('p',job.id+' · '+job.state+' · '+job.batch.documents.length+' document(s)'));
   const save=el('button','Export migration recovery '+job.id);save.type='button';save.addEventListener('click',()=>{if(active())download('Office migration recovery',JSON.stringify(job,null,2),true);});row.append(save);
   if(job.state==='pending'){
    const resume=el('button','Resume migration '+job.id);resume.type='button';resume.addEventListener('click',()=>void run(async()=>{await connected();const result=await resumeMigration(store,transport,job.id,active);assertActive();message.textContent=result.state==='applied'?'Migration committed and restored locally.':'Migration blocked by cloud ID collision. No documents imported.';await refreshJobs();await onChange();}));row.append(resume);
   }
   jobs.append(row);
  }
 }
 input.addEventListener('change',()=>{const file=input.files?.[0];input.value='';if(busy)return;backup=null;confirmation.value='';confirmation.disabled=true;start.disabled=true;preview.replaceChildren();if(!file)return;void run(async()=>{
  if(file.size>MAX_BACKUP_BYTES)throw Error('Backup exceeds size limit.');
  const verified=await parsePortableBackup(await file.text());assertActive();
  // Verify actual editor grammar for every structured snapshot, including history.
  const structured=verified.documents.flatMap(d=>[d,...d.history]).filter(d=>d.rich);
  if(structured.length){const {validateStructuredImport}=await import('./structured-bundle.js');for(const d of structured)validateStructuredImport(d.rich);}
  await connected();const candidate=verified.backup;
  if(candidate.scope!=='guest'&&candidate.scope!=='user:'+store.owner)throw Error('Source and destination account differ.');
  const local=await store.list(),remote=await transport.manifest(store.owner);assertActive();
  const plan=await migrationPlan(candidate,store.owner,candidate.scope,local.map(d=>d.id),remote.map(d=>d.id));assertActive();
  preview.append(el('p','Source: '+candidate.source+' · '+candidate.scope),el('p',plan.documents.length+' document(s) · SHA-256 verified'),el('p','Creation timestamp: '+plan.createdAtPolicy));
  for(const d of plan.documents)preview.append(el('p',d.title+' · '+d.id+' · revision '+d.revision));
  if(plan.collisions.length){preview.append(el('p','Blocked IDs: '+plan.collisions.map(d=>d.id).join(', ')));message.textContent='Collision detected. Nothing will be overwritten.';return;}
  backup=candidate;confirmation.disabled=false;message.textContent='Preview ready. Type the exact source scope to attest ownership.';
 });});
 const start=action('Import verified backup',async()=>{
  if(!backup)throw Error('Choose a verified backup first.');
  await connected();const local=await store.list(),remote=await transport.manifest(store.owner);assertActive();
  const plan=await migrationPlan(backup,store.owner,confirmation.value,local.map(d=>d.id),remote.map(d=>d.id));assertActive();
  if(plan.status!=='ready')throw Error('Destination collision. No import performed.');
  if(!window.confirm('Import '+plan.documents.length+' documents into this account without replacing existing records?'))return;
  assertActive();const batch=await makeBatch(plan);assertActive();const job=await beginMigration(store,batch);backup=null;confirmation.value='';confirmation.disabled=true;preview.replaceChildren();
  await refreshJobs();const result=await resumeMigration(store,transport,job.id,active);assertActive();
  message.textContent=result.state==='applied'?'Migration committed and restored locally.':'Migration blocked by cloud ID collision. No documents imported.';await refreshJobs();await onChange();
 });start.disabled=true;
 panel.append(note,exportBtn,el('p','Select a verified Hub export or Office document backup:'),input,preview,el('p','Source ownership confirmation:'),confirmation,start,message,jobs);
 void refreshJobs().catch(()=>{if(active())message.textContent='Migration recovery records could not be loaded.';});
 return panel;
}
