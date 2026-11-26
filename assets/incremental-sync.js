import {validateManifest,validateSyncDocument} from './sync-contract.js';
// Bounded manifest (server caps at 100 documents): revision comparison needs no fragile clock cursor.
// A fresh manifest on every cycle tolerates interruption at every individual await.
export async function synchronizeWorkspace(store,transport,{discover=true,active=()=>true}={}){
 const check=()=>{if(!active())throw Error('Workspace changed. Synchronization stopped.');};
 check();let pushed=0,pulled=0;
 for(const doc of await store.list()){
  check();let row=await store.inspect(doc.id);
  for(let i=0;i<100&&row?.pending.length&&!row.conflict;i++){
   check();const response=await store.flush(doc.id,transport);check();
   if(response.status==='applied')pushed++;
   row=await store.inspect(doc.id);
   if(response.status!=='applied')break;
  }
 }
 if(discover){
  check();const manifest=validateManifest(await transport.manifest(store.owner));check();
  const ids=new Set(manifest.map(x=>x.id));
  for(const entry of manifest){
   check();const row=await store.inspect(entry.id);check();
   if(row?.pending.length||row?.conflict||row?.remoteRevision===entry.revision)continue;
   const remote=await transport.pull(store.owner,entry.id);check();
   // A concurrent write may advance past the manifest; never accept an older result.
   if(!remote)continue;validateSyncDocument(remote);
   if(remote.id!==entry.id||remote.revision<entry.revision)throw Error('Cloud discovery returned stale data.');
   await store.acceptRemote(remote);pulled++;
  }
  for(const doc of await store.list()){
   check();if(ids.has(doc.id))continue;
   const row=await store.inspect(doc.id);
   if(row&&!row.pending.length&&!row.conflict&&row.remoteRevision!==null){
    // A manifest can race with an upload from a second tab. Confirm absence directly.
    const remote=await transport.pull(store.owner,doc.id);check();
    if(remote)await store.acceptRemote(remote);else await store.markRemoteMissing(doc.id,row.doc);
   }
  }
 }
 let remaining=0,conflicts=0;
 for(const doc of await store.list()){check();const row=await store.inspect(doc.id);remaining+=row?.pending.length??0;if(row?.conflict)conflicts++;}
 check();return {pushed,pulled,remaining,conflicts};
}
