import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function prepareDatabase(out){
 const manifest=JSON.parse(await readFile(join(root,'server/release/INSTALL_ORDER.json'),'utf8'));
 if(manifest.mode!=='source-only'||manifest.gate!=='disabled')throw Error('Invalid release contract.');
 let sql="-- REVIEW ONLY. Do not execute without separate authorization.\nBEGIN;\n";
 const hashes={};
 for(const file of manifest.files){
  if(!/^server\/proposals\/[a-z0-9.-]+\.sql$/.test(file))throw Error('Unexpected proposal path.');
  const s=await readFile(join(root,file),'utf8');
  const stripped=s.replace(/^begin;\s*$/im,'').replace(/^commit;\s*$/im,'');
  if(/^\s*(begin|commit|rollback);/im.test(stripped))throw Error('Unexpected transaction wrapper '+file);
  hashes[file]=createHash('sha256').update(s).digest('hex');sql+='\n-- '+file+'\n'+stripped+'\n';
 }
 sql+="\nDO $$ BEGIN IF (SELECT enabled FROM office_private.release_gate WHERE singleton) IS DISTINCT FROM false THEN RAISE EXCEPTION 'Office gate must remain disabled'; END IF; END $$;\nCOMMIT;\n";
 await mkdir(out);await writeFile(join(out,'install-disabled.sql'),sql,{flag:'wx'});await writeFile(join(out,'manifest.json'),JSON.stringify({...manifest,hashes},null,2)+'\n',{flag:'wx'});return sql;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){if(!process.argv[2])throw Error('Fresh output directory required.');await prepareDatabase(resolve(process.argv[2]));console.log('PASS: generated review-only transactional SQL; nothing executed.');}
