import {create,revise,Conflict} from './model.js';
// Deliberately separate origin and database: no Hub records are read or migrated.
export const DB_NAME='thiepn-standalone-office-o2';
export function openOffice(){
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB_NAME,1);
  req.onupgradeneeded=()=>{req.result.createObjectStore('documents',{keyPath:'id'});};
  req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error('Close other Office tabs and reload.'));
  req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>db.close();resolve(new OfficeStore(db));};
 });
}
export class OfficeStore {
 constructor(db){this.db=db;}
 run(mode,work){
  return new Promise((resolve,reject)=>{
   const tx=this.db.transaction('documents',mode);const store=tx.objectStore('documents');let result,error;
   tx.oncomplete=()=>resolve(result);
   tx.onerror=()=>reject(error||tx.error||new Error('Storage transaction failed.'));
   tx.onabort=()=>reject(error||tx.error||new Error('Storage transaction cancelled.'));
   const fail=e=>{error=e;try{tx.abort();}catch{reject(e);}};
   try{work(store,v=>{result=v;},fail);}catch(e){fail(e);}
  });
 }
 list(){return this.run('readonly',(s,done)=>{const req=s.getAll();req.onsuccess=()=>done(req.result);});}
 get(id){return this.run('readonly',(s,done)=>{const req=s.get(id);req.onsuccess=()=>done(req.result);});}
 add(title,body,rich){return this.run('readwrite',(s,done)=>{const doc=create(crypto.randomUUID(),title,body,new Date().toISOString(),rich);s.add(doc);done(doc);});}
 save(id,expected,patch){return this.run('readwrite',(s,done,fail)=>{
  const req=s.get(id);req.onsuccess=()=>{try{if(!req.result)throw new Conflict();const next=revise(req.result,expected,patch);if(next!==req.result)s.put(next);done(next);}catch(e){fail(e);}};
 });}
}
