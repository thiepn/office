import {validateRich} from './rich-format.js';
import {validate} from './model.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function ownerId(value){if(typeof value!=='string'||!uuid.test(value))throw new Error('Verified canonical account required.');return value.toLowerCase();}
const idPattern=/^[A-Za-z0-9-]{1,80}$/;
const stamp=v=>typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v));
const rev=v=>Number.isSafeInteger(v)&&v>=0;
export function documentId(v){if(typeof v!=='string'||!idPattern.test(v))throw new Error('Invalid document ID.');return v;}
export function validateSyncDocument(d){
 if(!d||d.schemaVersion!==1||!rev(d.revision)||!stamp(d.createdAt)||!stamp(d.updatedAt)||typeof d.trashed!=='boolean'||!Array.isArray(d.history)||d.history.length>12||Object.keys(d).some(k=>!['schemaVersion','id','title','body','createdAt','updatedAt','revision','history','trashed','rich'].includes(k)))throw new Error('Invalid Office document.');
 documentId(d.id);validate(d.title,d.body);
 function rich(row){if(row.rich!==undefined){validateRich(row.rich);if(row.rich.originalMarkdown!==row.body)throw new Error('Original Markdown mismatch.');}}
 rich(d);let previous=-1;
 for(const row of d.history){
  if(!row||!rev(row.revision)||row.revision<=previous||row.revision>=d.revision||!stamp(row.updatedAt)||typeof row.trashed!=='boolean'||Object.keys(row).some(k=>!['revision','title','body','updatedAt','trashed','rich'].includes(k)))throw new Error('Invalid revision history.');
  validate(row.title,row.body);rich(row);previous=row.revision;
 }
 if(JSON.stringify(d).length>15000000)throw new Error('Document backup exceeds size limit.');
 return d;
}
export function operation(id,expected,doc){
 ownerId(id);validateSyncDocument(doc);
 if(expected!==null&&(!rev(expected)||doc.revision!==expected+1))throw new Error('Invalid CAS transition.');
 return {id,expected,doc};
}
export function validateRemote(result,op){
 if(!result||!['applied','conflict'].includes(result.status)||result.operationId!==op.id)throw new Error('Invalid synchronization response.');
 if(result.status==='applied'&&result.revision!==op.doc.revision)throw new Error('Unexpected committed revision.');
 if(result.status==='conflict'&&result.document!==null){validateSyncDocument(result.document);if(result.document.id!==op.doc.id)throw new Error('Wrong conflict document.');}
 return result;
}
// Owner is supplied only as an additional server-side equality assertion, never authority.
export function createOfficeTransport({session,issuer,publishableKey,fetcher=fetch}){
 if(issuer!=='https://hycegznamzjhwinegaai.supabase.co'||typeof publishableKey!=='string'||!publishableKey)throw new Error('Unapproved Account configuration.');
 async function request(owner,name,args){
  owner=ownerId(owner);
  const before=await session.verify();if(before.status!=='signed-in'||ownerId(before.id)!==owner)throw new Error('Account verification required.');
  const token=await session.getAccessToken();if(!token)throw new Error('Account session unavailable.');
  const response=await fetcher(issuer+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:publishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({p_expected_owner:owner,...args}),credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('Office synchronization unavailable ('+response.status+'). Local edits retained.');
  const payload=await response.json();
  const after=await session.verify();if(after.status!=='signed-in'||ownerId(after.id)!==owner)throw new Error('Account changed during synchronization.');
  return payload;
 }
 return Object.freeze({async push(owner,op){return validateRemote(await request(owner,'office_sync_push',{p_operation:op}),op);},async pull(owner,id){const d=await request(owner,'office_sync_read',{p_document_id:documentId(id)});if(d!==null){validateSyncDocument(d);if(d.id!==id)throw new Error('Wrong remote record.');}return d;}});
}
