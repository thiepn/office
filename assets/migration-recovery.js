import {fingerprint,validateBatch,validateBatchReceipt} from './portable-backup.js';
// A job is durable before the network call. A failed acknowledgement never generates a new batch ID.
export async function beginMigration(store,batch){
 validateBatch(batch,store.owner);
 const job={id:batch.id,batch,digest:await fingerprint(batch),state:'pending'};
 await store.stageMigration(job);return job;
}
export async function resumeMigration(store,transport,id,active=()=>true){
 const job=await store.getMigration(id);
 if(!job)throw Error('Migration recovery job unavailable.');
 if(job.state!=='pending')return job;
 validateBatch(job.batch,store.owner);
 if(job.digest!==await fingerprint(job.batch))throw Error('Migration recovery fingerprint mismatch.');
 if(!active())throw Error('Account changed.');
 const receipt=validateBatchReceipt(await transport.importBatch(store.owner,job.batch),job.batch);
 if(!active())throw Error('Account changed; retry the original migration after reconnecting.');
 return store.finishMigration(job,receipt);
}
