import {ownerId} from './sync-contract.js';
import {openAccountWorkspace} from './account-store.js';
export function workspaceSession(runtime,{onLock=()=>{},onState=()=>{}}={}){
 let owner=null,store=null,epoch=0,closed=false,state='guest',verification=null,locked=false;
 const session=runtime.session;
 function publish(next){state=next;onState({state,owner});}
 function lock(reason){locked=true;++epoch;const previous=store;store=null;owner=null;publish(reason);let recovery;try{recovery=onLock(reason,previous);}catch{}return Promise.resolve(recovery).finally(()=>previous?.close());}
 const unsubscribe=session.subscribe(identity=>{
  if(owner===null)return;
  if(identity.status==='unavailable'){publish('offline');return;}
  if(identity.status!=='signed-in'||ownerId(identity.id)!==owner)void lock('locked').catch(()=>{});
  else if(state==='offline')publish('connected');
 });
 async function verify(){
  if(closed||locked)return null;
  if(verification)return verification;
  const run=async()=>{const current=epoch;let identity;try{identity=await session.verify();}catch{identity={status:'unavailable'};}
   if(closed||current!==epoch)return null;
   if(identity.status==='unavailable'){publish(owner?'offline':'unavailable');return store;}
   if(identity.status!=='signed-in'){await lock('signed-out');return null;}
   const id=ownerId(identity.id);if(owner&&id!==owner){await lock('locked');return null;}
   if(store){publish('connected');return store;}
   const next=await openAccountWorkspace(identity);
   if(closed||current!==epoch||session.identity().status!=='signed-in'||ownerId(session.identity().id)!==id){next.close();return null;}
   owner=id;store=next;publish('connected');return store;
  };
  const flight=run();verification=flight;try{return await flight;}finally{if(verification===flight)verification=null;}
 }
 return Object.freeze({verify,get store(){return store;},get owner(){return owner;},get state(){return state;},async disconnect(){try{await lock('signed-out');}finally{await runtime.disconnect();}},dispose(){closed=true;unsubscribe();void lock('locked').catch(()=>{});}});
}
