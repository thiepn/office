import {create,revise,Conflict} from './model.js';
import {ownerId,documentId,validateSyncDocument,operation,validateRemote} from './sync-contract.js';
// Deliberately separate from the original standalone guest DB and Hub DB.
export const ACCOUNT_DB='thiepn-office-account-o4-v1';
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export async function openAccountWorkspace(identity){
 if(identity?.status!=='signed-in')throw new Error('Verified account identity required.');
 const owner=ownerId(identity.id);
 const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(ACCOUNT_DB,3);q.onupgradeneeded=()=>{if(!q.result.objectStoreNames.contains('records'))q.result.createObjectStore('records',{keyPath:['owner','id']});if(!q.result.objectStoreNames.contains('drafts'))q.result.createObjectStore('drafts',{keyPath:['owner','id']});if(!q.result.objectStoreNames.contains('archives'))q.result.createObjectStore('archives',{keyPath:['owner','id']});};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);q.onblocked=()=>reject(new Error('Account workspace blocked.'));});
 let closed=false;
 db.onversionchange=()=>{closed=true;db.close();};
 function run(mode,fn,table='records'){
  if(closed)return Promise.reject(new Error('Account workspace closed.'));
  return new Promise((resolve,reject)=>{const tx=db.transaction(table,mode),s=tx.objectStore(Array.isArray(table)?table[0]:table);let result,error;const fail=e=>{error=e;try{tx.abort();}catch{reject(e);}};
   tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(error??tx.error??new Error('Account storage rolled back.'));
   try{fn(s,v=>{result=v;},fail);}catch(e){fail(e);}
  });
 }
 const key=id=>[owner,documentId(id)];
 function edit(id,fn){return run('readwrite',(s,done,fail)=>{const q=s.get(key(id));q.onsuccess=()=>{try{const row=fn(q.result);if(row){s.put(row);done(row);}else done(q.result);}catch(e){fail(e);}};});}
 function newRow(doc){validateSyncDocument(doc);return {owner,id:doc.id,doc,remoteRevision:null,pending:[operation(crypto.randomUUID(),null,doc)],conflict:null};}
 const api={
  owner,
  close(){closed=true;db.close();},
  list(){return run('readonly',(s,done)=>{const q=s.getAll(IDBKeyRange.bound([owner,''],[owner,'\uffff']));q.onsuccess=()=>done(q.result.map(r=>r.doc));});},
  get(id){return run('readonly',(s,done)=>{const q=s.get(key(id));q.onsuccess=()=>done(q.result?.doc);});},
  async add(title,body,rich){const doc=create(crypto.randomUUID(),title,body,new Date().toISOString(),rich);await api.importMissing([doc]);return doc;},
  async importMissing(docs){if(!Array.isArray(docs)||!docs.length||docs.length>100)throw new Error('Choose 1–100 documents.');const seen=new Set();const rows=docs.map(d=>{if(seen.has(d.id))throw new Error('Duplicate document ID.');seen.add(d.id);return newRow(d);});return run('readwrite',(s,done)=>{for(const row of rows)s.add(row);done(rows.length);});},
  async save(id,expected,patch,expectedSnapshot){const r=await edit(id,row=>{if(!row||(expectedSnapshot&&!equal(row.doc,expectedSnapshot)))throw new Conflict();const next=revise(row.doc,expected,patch);if(next===row.doc)return row;if(row.pending.length>=100)throw new Error('Offline queue full. Export the draft before continuing.');row.pending.push(operation(crypto.randomUUID(),row.doc.revision,next));row.doc=next;return row;});return r.doc;},
  saveDraft(id,draft){documentId(id);if(!draft||JSON.stringify(draft).length>16000000)throw Error('Recovery draft exceeds limit.');return run('readwrite',(s,done)=>{s.put({owner,id,draft});done(true);},'drafts');},
  readDraft(id){return run('readonly',(s,done)=>{const q=s.get(key(id));q.onsuccess=()=>done(q.result?.draft??null);},'drafts');},
  listDrafts(){return run('readonly',(s,done)=>{const q=s.getAll(IDBKeyRange.bound([owner,''],[owner,'\uffff']));q.onsuccess=()=>done(q.result.map(({id,draft})=>({id,draft})));},'drafts');},
  clearDraft(id){return run('readwrite',(s,done)=>{s.delete(key(id));done(true);},'drafts');},
  inspect(id){return run('readonly',(s,done)=>{const q=s.get(key(id));q.onsuccess=()=>done(q.result);});},
  listArchives(){return run('readonly',(s,done)=>{const q=s.getAll(IDBKeyRange.bound([owner,''],[owner,'\uffff']));q.onsuccess=()=>done(q.result);},'archives');},
  async markRemoteMissing(id,expected){return edit(id,row=>{if(!row||row.conflict||row.pending.length||!equal(row.doc,expected)||row.remoteRevision===null)return row;return {...row,conflict:{reason:'remote missing',document:null}};});},
  async refreshConflict(id,expected,latest){
   if(latest!==null){validateSyncDocument(latest);if(latest.id!==id)throw Error('Wrong conflict document.');}
   return edit(id,row=>{if(!row?.conflict||!equal(row,expected))throw new Conflict();return {...row,conflict:{...row.conflict,previousDocuments:[...(row.conflict.previousDocuments??[]),row.conflict.document].slice(-12),document:latest}};});
  },
  async resolveConflict(id,expected,choice,latest){
   documentId(id);
   if(!['remote','fork','local'].includes(choice))throw Error('Invalid resolution.');
   if(latest!==null){validateSyncDocument(latest);if(latest.id!==id)throw Error('Wrong conflict document.');}
   if((choice==='remote'||choice==='fork')&&!latest)throw Error('Cloud version unavailable. Retry or explicitly retain local version.');
   return run('readwrite',(s,done,fail)=>{
    const q=s.get(key(id));q.onsuccess=()=>{try{
     const row=q.result;if(!row?.conflict||!equal(row,expected))throw new Conflict();
     // Archive every divergent local revision, immutable queued operation and previously observed remote version atomically.
     const archive={owner,id:crypto.randomUUID(),documentId:id,recordedAt:new Date().toISOString(),choice,local:row.doc,pending:row.pending,conflict:row.conflict,remote:latest};
     const clean=latest?{owner,id,doc:latest,remoteRevision:latest.revision,pending:[],conflict:null}:null;
     let next=clean,fork=null;
     if(choice==='fork'){fork=newRow({...row.doc,id:crypto.randomUUID()});}
     if(choice==='local'){
      if(!latest){next=newRow(row.doc);}
      else{
       if(latest.rich&&(!row.doc.rich||latest.body!==row.doc.body))throw Error('Original structured Markdown differs. Preserve local as a separate document.');
       const patch={title:row.doc.title,body:row.doc.body,trashed:row.doc.trashed,...(row.doc.rich?{rich:row.doc.rich}:{})};
       const doc=revise(latest,latest.revision,patch);
       next=doc===latest?clean:{...clean,doc,pending:[operation(crypto.randomUUID(),latest.revision,doc)]};
      }
     }
     s.transaction.objectStore('archives').add(archive);s.put(next);if(fork)s.add(fork);done({archiveId:archive.id,forkId:fork?.id??null,document:next.doc});
    }catch(e){fail(e);}};
   },['records','archives']);
  },
  async acceptRemote(doc){validateSyncDocument(doc);return edit(doc.id,row=>{if(!row)return {owner,id:doc.id,doc,remoteRevision:doc.revision,pending:[],conflict:null};if(row.pending.length||row.conflict)return row;if(doc.revision<row.doc.revision)return row;if(doc.revision===row.doc.revision&&!equal(doc,row.doc))return {...row,conflict:{reason:'same-revision divergence',document:doc}};return {...row,doc,remoteRevision:doc.revision};});},
  async flush(id,transport){
   // One immutable operation at a time. A response is committed only against the same queue head.
   const row=await api.inspect(id);if(!row||row.conflict||!row.pending.length)return {status:row?.conflict?'conflict':'idle'};
   const op=row.pending[0];const response=validateRemote(await transport.push(owner,op),op);
   await edit(id,current=>{if(!current||current.pending[0]?.id!==op.id)return current;
    if(response.status==='conflict')return {...current,conflict:{operationId:op.id,document:response.document}};
    return {...current,remoteRevision:response.revision,pending:current.pending.slice(1)};
   });return response;
  }
 };
 return Object.freeze(api);
}
