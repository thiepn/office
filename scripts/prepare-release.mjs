import {mkdir,readFile,writeFile,copyFile,lstat,readdir} from 'node:fs/promises';
import {resolve,join,dirname,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const releaseFiles=Object.freeze(['index.html','docs/index.html','auth/callback/index.html','assets/office.css','assets/boot.js','assets/callback.js','assets/app.js','assets/account-store.js','assets/account-activation.js','assets/authoring-format.js','assets/academic-format.js','assets/equation-format.js','assets/hub-export.js','assets/incremental-sync.js','assets/migration-panel.js','assets/migration-preview.js','assets/migration-recovery.js','assets/model.js','assets/portable-backup.js','assets/research-format.js','assets/rich-format.js','assets/store.js','assets/sync-contract.js','assets/visual.js','assets/workspace-session.js','assets/structured-bundle.js','assets/account-bundle.js']);
export const headers="/*\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://hycegznamzjhwinegaai.supabase.co; frame-src https://account.thiepn.dev; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; worker-src 'none'\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Cache-Control: no-cache\n";
const digest=b=>createHash('sha256').update(b).digest('hex');
export async function prepareRelease({source=root,destination,sha}){
 if(!/^[a-f0-9]{40}$/.test(sha??''))throw Error('Exact source SHA required.');
 if(!destination)throw Error('Fresh output directory required.');
 const out=resolve(destination),src=resolve(source);
 if(out===src||out.startsWith(src+'/')&&relative(src,out).split('/')[0]!=='dist')throw Error('Use an external fresh directory or dist.');
 const boot=await readFile(join(src,'assets/boot.js'),'utf8'),callback=await readFile(join(src,'assets/callback.js'),'utf8'),runtime=await readFile(join(src,'assets/account-runtime.ts'),'utf8');
 if(!boot.includes('startOffice(null)')||/completeCallback\s*\(/.test(callback)||!runtime.includes('LIVE_ACCOUNT_ENABLED=false'))throw Error('Guest release boundary changed.');
 // Refuse existing output, including symlinks; never delete a directory.
 await mkdir(out);
 const files={};
 for(const path of releaseFiles){
  const input=join(src,path),target=join(out,path);
  if(!(await lstat(input)).isFile())throw Error('Non-regular release source: '+path);
  await mkdir(dirname(target),{recursive:true});await copyFile(input,target);
  files[path]=digest(await readFile(target));
 }
 await writeFile(join(out,'_headers'),headers,{flag:'wx'});files['_headers']=digest(headers);
 await writeFile(join(out,'release.json'),JSON.stringify({schemaVersion:1,sha,mode:'guest-only',accountActivation:false,files},null,2)+'\n',{flag:'wx'});
 return {out,files};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const [, ,destination,sha]=process.argv;const r=await prepareRelease({destination,sha});console.log('PASS: prepared guest-only static artifact ('+Object.keys(r.files).length+' hashed files); no deployment.');
}
