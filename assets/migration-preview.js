import {validateSyncDocument,documentId} from './sync-contract.js';
import {validate} from './model.js';
// This parser consumes an explicit exported batch only. It never opens Hub storage.
export function previewHubExport(records,existingIds=[]){
 if(!Array.isArray(records)||!records.length||records.length>100)throw new Error('Choose 1–100 exported Hub documents.');
 const seen=new Set(),occupied=new Set(existingIds),converted=[],collisions=[];
 for(const d of records){
  if(!d||d.schemaVersion!==1||Object.keys(d).sort().join('|')!==['schemaVersion','id','title','body','revision','updatedAt','history'].sort().join('|')||!Array.isArray(d.history))throw new Error('Unsupported Hub export record.');
  documentId(d.id);if(seen.has(d.id))throw new Error('Duplicate source ID.');seen.add(d.id);validate(d.title,d.body);
  const history=d.history.map(h=>{if(!h||Object.keys(h).sort().join('|')!==['revision','title','body','updatedAt'].sort().join('|'))throw new Error('Invalid Hub history.');return {...h,trashed:false};});
  // Hub has no createdAt field; use earliest available known timestamp, never claim it is the original creation date.
  const createdAt=[d.updatedAt,...history.map(h=>h.updatedAt)].sort()[0];
  const next=validateSyncDocument({...d,createdAt,trashed:false,history});
  if(occupied.has(d.id))collisions.push(d.id);converted.push(next);
 }
 return {status:collisions.length?'blocked':'ready',count:converted.length,collisions,records:converted,createdAtPolicy:'earliest available revision timestamp, not original creation date'};
}
