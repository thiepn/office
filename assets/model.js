export const LIMIT=200000, HISTORY=12;
export function validate(title,body){
 if(typeof title!=='string'||!title.trim()||title.length>120)throw new Error('Enter a title of 1–120 characters.');
 if(typeof body!=='string'||body.length>LIMIT)throw new Error('Document exceeds the 200,000-character limit.');
}
export function create(id,title='Untitled document',body='',now=new Date().toISOString()){
 validate(title,body);return {schemaVersion:1,id,title,body,createdAt:now,updatedAt:now,revision:0,history:[],trashed:false};
}
export class Conflict extends Error {constructor(){super('This document changed in another tab. Your local edits have not been overwritten.');this.name='Conflict';}}
export function revise(doc,expected,patch,now=new Date().toISOString()){
 if(!doc||doc.revision!==expected)throw new Conflict();
 const title=patch.title??doc.title,body=patch.body??doc.body,trashed=patch.trashed??doc.trashed;
 validate(title,body);
 if(title===doc.title&&body===doc.body&&trashed===doc.trashed)return doc;
 return {...doc,title,body,trashed,updatedAt:now,revision:doc.revision+1,history:[...doc.history,{revision:doc.revision,title:doc.title,body:doc.body,updatedAt:doc.updatedAt,trashed:doc.trashed}].slice(-HISTORY)};
}
export function selectDocuments(rows,{query='',sort='recent',trash=false}={}){
 const q=query.trim().toLocaleLowerCase();
 return rows.filter(d=>d.trashed===trash&&(!q||d.title.toLocaleLowerCase().includes(q)||d.body.toLocaleLowerCase().includes(q))).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title)||a.id.localeCompare(b.id):b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));
}
export function filename(title){return (title.replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').replace(/[. ]+$/,'').trim().slice(0,80)||'document')+'.md';}
