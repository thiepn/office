import {create,revise,Conflict} from './model.js';
import {ownerId,documentId,validateSyncDocument,operation,validateRemote} from './sync-contract.js';
// Deliberately separate from the original standalone guest DB and Hub DB.
export const ACCOUNT_DB='thiepn-office-account-o4-v1';
export async function openAccountWorkspace(identity){
 if(identity?.status!=='signed-in')throw new Error('Verified account identity required.');
 const owner=ownerId(identity.id);
 const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(ACCOUNT_DB,1);q.onupgradeneeded=()=>q.result.createObjectStore('records',{keyPath:['owner','id']});q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);q.onblocked=()=>reject(new Error('Account workspace blocked.'));});
 let closed=false;
 db.onversionchange=()=>{closed=true;db.close();};
 function run(mode,fn){
  if(closed)return Promise.reject(new Error('Account workspace closed.'));
  return new Promise((resolve,reject)=>{const tx=db.transaction('records',mode),s=tx.objectStore('records');let result,error;const fail=e=>{error=e;try{tx.abort();}catch{reject(e);}};
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
  async save(id,expected,patch){const r=await edit(id,row=>{if(!row)throw new Conflict();const next=revise(row.doc,expected,patch);if(next===row.doc)return row;if(row.pending.length>=100)throw new Error('Offline queue full. Export the draft before continuing.');row.pending.push(operation(crypto.randomUUID(),row.doc.revision,next));row.doc=next;return row;});return r.doc;},
  inspect(id){return run('readonly',(s,done)=>{const q=s.get(key(id));q.onsuccess=()=>done(q.result);});},
  async acceptRemote(doc){validateSyncDocument(doc);return edit(doc.id,row=>{if(!row)return {owner,id:doc.id,doc,remoteRevision:doc.revision,pending:[],conflict:null};if(row.pending.length||row.conflict)return row;if(doc.revision<row.doc.revision)return row;if(doc.revision===row.doc.revision&&JSON.stringify(doc)!==JSON.stringify(row.doc))return {...row,conflict:{reason:'same-revision divergence',document:doc}};return {...row,doc,remoteRevision:doc.revision};});},
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
