import {ownerId,validateSyncDocument} from './sync-contract.js';
import {previewHubExport} from './migration-preview.js';
export const MAX_BACKUP_BYTES=16000000;
export const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const encoder=new TextEncoder();
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===keys.slice().sort().join('|');
const stamp=v=>typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v));
export async function fingerprint(value){
 const bytes=encoder.encode(JSON.stringify(canonical(value)));
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
}
function validateScope(source,scope){
 if(source==='hub'&&scope==='guest')return scope;
 if(typeof scope!=='string'||!scope.startsWith('user:')||'user:'+ownerId(scope.slice(5))!==scope)throw Error('Invalid source owner scope.');
 return scope;
}
function validateRecords(source,records){
 if(!Array.isArray(records)||records.length<1||records.length>100)throw Error('Backup requires 1–100 documents.');
 if(source==='hub')return previewHubExport(records).records;
 if(source!=='office')throw Error('Unsupported backup source.');
 const ids=new Set();return records.map(d=>{validateSyncDocument(d);if(ids.has(d.id))throw Error('Duplicate document ID.');ids.add(d.id);return d;});
}
async function recordFingerprints(records){
 return Promise.all(records.map(async d=>({id:d.id,revision:d.revision,document:await fingerprint(d),history:await Promise.all(d.history.map(async h=>({revision:h.revision,sha256:await fingerprint(h)})))})));
}
// Explicit caller-supplied snapshot from the selected Hub scope. No cross-origin storage access.
export async function createPortableBackup(source,scope,records,exportedAt=new Date().toISOString()){
 validateScope(source,scope);if(!stamp(exportedAt))throw Error('Invalid export timestamp.');
 const snapshot=JSON.parse(JSON.stringify(records));validateRecords(source,snapshot);
 const payload={kind:'thiepn-office-portable-backup',version:1,source,scope,exportedAt,records:snapshot,fingerprints:await recordFingerprints(snapshot)};
 const result={...payload,sha256:await fingerprint(payload)};
 if(encoder.encode(JSON.stringify(result)).length>MAX_BACKUP_BYTES)throw Error('Backup exceeds size limit.');
 return result;
}
export async function verifyPortableBackup(value){
 if(!exact(value,['kind','version','source','scope','exportedAt','records','fingerprints','sha256'])||value.kind!=='thiepn-office-portable-backup'||value.version!==1||!stamp(value.exportedAt)||!['hub','office'].includes(value.source))throw Error('Unsupported portable backup.');
 if(encoder.encode(JSON.stringify(value)).length>MAX_BACKUP_BYTES)throw Error('Backup exceeds size limit.');
 validateScope(value.source,value.scope);const documents=validateRecords(value.source,value.records);
 const {sha256,...payload}=value;
 if(sha256!==await fingerprint(payload)||!same(value.fingerprints,await recordFingerprints(value.records)))throw Error('Backup fingerprint mismatch.');
 return {backup:value,documents};
}
export async function parsePortableBackup(text){
 if(typeof text!=='string'||encoder.encode(text).length>MAX_BACKUP_BYTES)throw Error('Backup exceeds size limit.');
 return verifyPortableBackup(JSON.parse(text));
}
export async function migrationPlan(backup,targetOwner,confirmation,localIds=[],remoteIds=[]){
 const owner=ownerId(targetOwner),verified=await verifyPortableBackup(backup);
 // The file is not signed. Typed confirmation is a user attestation, not proof of ownership.
 if(backup.scope!=='guest'&&backup.scope!=='user:'+owner)throw Error('Source and target account must match.');
 if(confirmation!==backup.scope)throw Error('Confirm the exact source scope before importing.');
 const local=new Set(localIds),remote=new Set(remoteIds);
 const collisions=verified.documents.filter(d=>local.has(d.id)||remote.has(d.id)).map(d=>({id:d.id,local:local.has(d.id),cloud:remote.has(d.id)}));
 return {owner,source:backup.source,scope:backup.scope,sourceDigest:backup.sha256,documents:verified.documents,collisions,status:collisions.length?'blocked':'ready',createdAtPolicy:backup.source==='hub'?'earliest available revision timestamp, not original creation date':'preserved'};
}
export async function makeBatch(plan){
 if(plan.status!=='ready'||plan.collisions.length)throw Error('Migration collisions must be resolved before import.');
 return {id:crypto.randomUUID(),source:plan.source,scope:plan.scope,sourceDigest:plan.sourceDigest,documents:JSON.parse(JSON.stringify(plan.documents))};
}
export function validateBatch(batch,owner){
 owner=ownerId(owner);
 if(!exact(batch,['id','source','scope','sourceDigest','documents'])||!['hub','office'].includes(batch.source)||!(/^[a-f0-9]{64}$/).test(batch.sourceDigest))throw Error('Invalid migration batch.');
 ownerId(batch.id);validateScope(batch.source,batch.scope);
 if(batch.scope!=='guest'&&batch.scope!=='user:'+owner)throw Error('Source account mismatch.');
 validateRecords('office',batch.documents);
 if(encoder.encode(JSON.stringify(batch)).length>MAX_BACKUP_BYTES)throw Error('Migration exceeds size limit.');
 return batch;
}
export function validateBatchReceipt(receipt,batch){
 if(!receipt||receipt.batchId!==batch.id||!['applied','blocked'].includes(receipt.status))throw Error('Invalid migration receipt.');
 if(receipt.status==='applied'){
  if(!exact(receipt,['batchId','status','documents'])||!same(receipt.documents,batch.documents.map(d=>({id:d.id,revision:d.revision}))))throw Error('Migration receipt does not match snapshot.');
 }else if(!exact(receipt,['batchId','status','collisions'])||!Array.isArray(receipt.collisions)||!receipt.collisions.length||new Set(receipt.collisions).size!==receipt.collisions.length||receipt.collisions.some(id=>!batch.documents.some(d=>d.id===id)))throw Error('Invalid migration collision receipt.');
 return receipt;
}
