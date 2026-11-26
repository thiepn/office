// Run after npm ci: compile the actual prepared TS adapter with the exact Hub validator.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {verifyPortableBackup,createPortableBackup} from '../assets/portable-backup.js';
const dir=await mkdtemp(join(tmpdir(),'office-hub-export-'));
try{
 const fixture=await readFile(new URL('../integrations/hub/fixtures/documents.ts',import.meta.url));
 const pin=JSON.parse(await readFile(new URL('../integrations/hub/SOURCE.json',import.meta.url),'utf8'));
 const hash=createHash('sha1').update('blob '+fixture.length+'\0').update(fixture).digest('hex');
 assert.equal(hash,pin.files['src/lib/office/documents.ts']);
 await writeFile(join(dir,'documents.ts'),fixture);
 await writeFile(join(dir,'standalone-backup.ts'),await readFile(new URL('../integrations/hub/standalone-backup.ts',import.meta.url)));
 await build({entryPoints:[join(dir,'standalone-backup.ts')],bundle:true,format:'esm',platform:'node',outfile:join(dir,'adapter.mjs')});
 const {standaloneOfficeBackup}=await import(pathToFileURL(join(dir,'adapter.mjs')).href);
 const scope='user:a0000000-0000-4000-8000-000000000001',stamp='2026-01-02T00:00:00Z';
 const record={schemaVersion:1,id:'hub-source',title:'Hub',body:'한글 **source**\n',revision:2,updatedAt:stamp,history:[{revision:1,title:'old',body:'line\r\n',updatedAt:'2026-01-01T00:00:00Z'}]};
 const backup=JSON.parse(await standaloneOfficeBackup(scope,[record],stamp));
 assert.deepEqual(backup,await createPortableBackup('hub',scope,[record],stamp));
 const checked=await verifyPortableBackup(backup);assert.equal(checked.documents[0].history[0].body,'line\r\n');
 await assert.rejects(standaloneOfficeBackup(scope,[record,record],stamp));
 console.log('PASS: prepared Hub TypeScript export compiles against pinned validator and matches Office fingerprint contract');
}finally{await rm(dir,{recursive:true,force:true});}
