import test from 'node:test';
import assert from 'node:assert/strict';
import {OFFICE_ORIGIN,OFFICE_ISSUER,OFFICE_CALLBACK,validateConnectedConfig,startConnectedCandidate,finishConnectedCandidate} from '../integrations/account/connected-entry.mjs';
const config={issuer:OFFICE_ISSUER,redirectUri:OFFICE_CALLBACK,clientId:'c0000000-0000-4000-8000-000000000001',publishableKey:'sb_publishable_fixture_only_000000000000'};
test('O6 source-only connected configuration accepts only canonical public client contract',()=>{
 assert.deepEqual(validateConnectedConfig(config,OFFICE_ORIGIN),config);
 for(const c of [{...config,issuer:'https://example.invalid'},{...config,redirectUri:OFFICE_CALLBACK+'?x=1'},{...config,clientId:'not-a-uuid'},{...config,publishableKey:'sb_secret_fixture_only_000000000000'},{...config,enabled:true}])assert.throws(()=>validateConnectedConfig(c,OFFICE_ORIGIN));
 assert.throws(()=>validateConnectedConfig(config,'https://office-preview.pages.dev'));
});
test('O6 connected entry fails closed on wrong origin and uses verified workspace path',async()=>{
 let started=0,failed=0;const runtime={};
 const base={config,location:{origin:OFFICE_ORIGIN,pathname:'/'},createRuntime:()=>runtime,startOffice:r=>{assert.equal(r,runtime);started++;},showBootError:()=>failed++};
 await startConnectedCandidate(base);await startConnectedCandidate({...base,location:{origin:'https://other.invalid',pathname:'/'}});assert.equal(started,1);assert.equal(failed,1);
});
test('O6 callback scrubs URL and accepts only verified signed-in result',async()=>{
 const events=[];const location={origin:OFFICE_ORIGIN,pathname:'/auth/callback/',replace:x=>events.push(x)};
 const base={config,location,history:{replaceState:(a,b,c)=>events.push(c)},createRuntime:()=>({completeCallback:async()=>({status:'signed-in'})}),showStatus:x=>events.push(x)};
 assert.equal(await finishConnectedCandidate(base),true);assert.deepEqual(events,['/auth/callback/','/?workspace=account']);events.length=0;
 assert.equal(await finishConnectedCandidate({...base,createRuntime:()=>({completeCallback:async()=>({status:'unavailable'})})}),false);
 assert.deepEqual(events,['/auth/callback/','Account connection could not be verified. Return to the guest workspace.']);
});
