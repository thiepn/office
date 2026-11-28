import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {prepareRelease,releaseFiles,headers} from '../scripts/prepare-release.mjs';
import {prepareDatabase} from '../scripts/prepare-database.mjs';
import {authorizeEvidence,requiredWorkflows} from '../scripts/authorize-release.mjs';
const sha='a'.repeat(40);
test('O6 exact-main manual artifact authorization rejects stale, failed and unauthorized releases',()=>{
 const evidence={sha,dispatchSha:sha,mainSha:sha,branch:'refs/heads/main',actor:'thiepn',triggeringActor:'thiepn',confirmation:'PREPARE OFFICE GUEST',runs:requiredWorkflows.map((name,id)=>({name,id,head_sha:sha,head_branch:'main',event:'push',status:'completed',conclusion:'success'}))};
 assert.equal(authorizeEvidence(evidence),true);
 for(const change of [{mainSha:'b'.repeat(40)},{actor:'other'},{triggeringActor:'other'},{confirmation:'DEPLOY'},{runs:evidence.runs.slice(1)},{runs:[...evidence.runs,{...evidence.runs[0],id:10,conclusion:'failure'}]}])assert.throws(()=>authorizeEvidence({...evidence,...change}));
});
test('O6 static package allowlist omits internal files and fails closed on enabled source',async()=>{
 const root=await mkdtemp(join(tmpdir(),'office-release-test-'));
 try{
  const src=join(root,'src');await mkdir(src);
  for(const path of releaseFiles){await mkdir(dirname(join(src,path)),{recursive:true});await writeFile(join(src,path),path==='assets/boot.js'?'startOffice(null)':path==='assets/callback.js'?'disabled':'fixture');}
  await writeFile(join(src,'assets/account-runtime.ts'),'LIVE_ACCOUNT_ENABLED=false');await writeFile(join(src,'private.sql'),'private');
  const dest=join(root,'out');await prepareRelease({source:src,destination:dest,sha});
  const manifest=JSON.parse(await readFile(join(dest,'release.json'),'utf8'));assert.equal(manifest.accountActivation,false);assert.equal(manifest.sha,sha);assert.equal(Object.keys(manifest.files).length,releaseFiles.length+1);assert.ok(!Object.hasOwn(manifest.files,'private.sql'));assert.match(headers,/frame-ancestors 'none'/);
  await assert.rejects(prepareRelease({source:src,destination:dest,sha}));
  await writeFile(join(src,'assets/account-runtime.ts'),'LIVE_ACCOUNT_ENABLED=true');await assert.rejects(prepareRelease({source:src,destination:join(root,'unsafe'),sha}),/boundary/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('O6 review-only migration bundle is transactional and preserves disabled gate',async()=>{
 const root=await mkdtemp(join(tmpdir(),'office-db-test-'));try{const sql=await prepareDatabase(join(root,'out'));assert.match(sql,/^-- REVIEW ONLY/);assert.match(sql,/Office gate must remain disabled/);assert.equal((sql.match(/^BEGIN;$/gim)??[]).length,1);assert.equal((sql.match(/^COMMIT;$/gim)??[]).length,1);assert.doesNotMatch(sql,/update office_private\.release_gate set enabled=true/i);}finally{await rm(root,{recursive:true,force:true});}
});
