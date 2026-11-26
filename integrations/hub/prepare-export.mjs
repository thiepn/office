// Prepared integration, never runs on normal Office builds. No automatic Git operations.
import {readFile,writeFile,access} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
export const HUB_PIN='b90e5cb41992839dafab1b9744ba52143426c9ce';
export const HUB_BLOB='57251e9a0290b1508c1b6d11ff278cb94e827c2c';
export const replacements=[
  [
    "import {OfficeDeviceStore} from '../lib/office/device';",
    "import {OfficeDeviceStore} from '../lib/office/device';\nimport {standaloneOfficeBackup} from '../lib/office/standalone-backup';"
  ],
  [
    "  const backup=pick<HTMLButtonElement>('[data-office-backup]');",
    "  const backup=pick<HTMLButtonElement>('[data-office-backup]');\n  const standaloneBackup=backup.cloneNode(false) as HTMLButtonElement;standaloneBackup.removeAttribute('data-office-backup');standaloneBackup.removeAttribute('id');standaloneBackup.type='button';standaloneBackup.textContent='Export for standalone Office';standaloneBackup.disabled=true;backup.after(standaloneBackup);"
  ],
  [
    "search.disabled=sort.disabled=backup.disabled=!store||!allowed()||busy;",
    "search.disabled=sort.disabled=backup.disabled=standaloneBackup.disabled=!store||!allowed()||busy;"
  ],
  [
    "  backup.addEventListener('click',()=>void (async()=>{",
    "  standaloneBackup.addEventListener('click',()=>void (async()=>{\n    if(!store||!allowed()||busy)return;\n    if(dirty||heldDraft||blocked){message('Save or export unsaved drafts before creating a portable backup.');return;}\n    const opened=store,ticket=epoch,scope=opened.scope;\n    if(window.prompt('Confirm the source scope for standalone Office export:',scope)!==scope)return;\n    if(ticket!==epoch||opened!==store||!allowed())return;\n    if(scope!==namespace(hubIdentity.status==='signed-in'?hubIdentity.id:null))return;\n    busy=true;enable();\n    try{\n      const documents=await opened.list();\n      if(ticket!==epoch||opened!==store||!allowed()||dirty||heldDraft||blocked)return;\n      const json=await standaloneOfficeBackup(scope,documents);\n      if(ticket!==epoch||opened!==store||!allowed()||dirty||heldDraft||blocked||scope!==namespace(hubIdentity.status==='signed-in'?hubIdentity.id:null))return;\n      downloadBlob(new Blob([json],{type:'application/json;charset=utf-8'}),'thiepn-office-portable-'+new Date().toISOString().slice(0,10)+'.json');\n      message('Verified portable backup exported. No source records changed.');\n    }catch(error){if(ticket===epoch)message(error instanceof Error?error.message:'Portable backup failed.');}\n    finally{if(ticket===epoch){busy=false;enable();}}\n  })());\n  backup.addEventListener('click',()=>void (async()=>{"
  ]
];
export function patchHubSource(source){
 const buffer=Buffer.from(source);const hash=createHash('sha1').update('blob '+buffer.length+'\0').update(buffer).digest('hex');
 if(hash!==HUB_BLOB)throw Error('Hub source differs from pinned blob. Re-audit before integrating.');
 let output=source;for(const [old,next] of replacements){if(output.split(old).length!==2)throw Error('Hub integration anchor changed.');output=output.replace(old,next);}return output;
}
async function main(){
 const [root,mode]=process.argv.slice(2);if(!root||!['--check','--apply'].includes(mode))throw Error('Usage: node integrations/hub/prepare-export.mjs /path/to/Hub --check|--apply');
 const cwd=resolve(root),script=resolve(cwd,'src/scripts/office-documents.ts'),helper=resolve(cwd,'src/lib/office/standalone-backup.ts');
 if(execFileSync('git',['rev-parse','HEAD'],{cwd,encoding:'utf8'}).trim()!==HUB_PIN)throw Error('Hub HEAD differs from approved baseline.');
 const status=execFileSync('git',['status','--porcelain','--','src/scripts/office-documents.ts','src/lib/office/standalone-backup.ts'],{cwd,encoding:'utf8'});if(status.trim())throw Error('Hub integration files are not clean.');
 try{await access(helper);throw Error('Helper already exists.');}catch(e){if(e.code!=='ENOENT')throw e;}
 const original=await readFile(script,'utf8'),output=patchHubSource(original),code=await readFile(resolve(dirname(fileURLToPath(import.meta.url)),'standalone-backup.ts'),'utf8');
 if(mode==='--check'){console.log('Hub source and integration anchors verified; no changes.');return;}
 await writeFile(helper,code,{flag:'wx'});
 try{await writeFile(script,output);}catch(e){console.error('Helper created; script write failed. Inspect and revert only these two files.');throw e;}
 console.log('Hub integration prepared locally. Review diff and run Hub Quality. No commit or deployment.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
